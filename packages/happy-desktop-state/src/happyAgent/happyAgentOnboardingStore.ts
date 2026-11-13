import { HappyAgentApiError, type HappyAgentClient } from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import type { HappyAgentMobileConnectorStore } from "./happyAgentMobileConnectorStore.js";
import {
    happyMobileOnboardingStoreCreate,
    type HappyMobileOnboardingStore,
} from "../onboarding/happyMobileOnboardingStore.js";
import {
    happyAgentOnboardingFlowDerive,
    happyAgentOnboardingGatesRead,
    type HappyAgentOnboardingFlow,
    type HappyAgentOnboardingGate,
} from "./happyAgentOnboardingGates.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "./happyAgentProviderCredentials.js";
import type {
    HappyAgentPluginConnectTarget,
    HappyAgentPluginsStore,
} from "./happyAgentPluginsStore.js";
import { UserError } from "../types.js";
import { deepEqual, happyAgentUserError } from "./happyAgentSupport.js";

/**
 * What the setup screens say about a failed read. A Happy Cloud server that
 * refuses a member with no saved profile is answered by the profile step
 * itself, so its refusal is no error to show beside it.
 */
function onboardingErrorOf(error: unknown): string | undefined {
    for (let current = error; current instanceof Error; current = current.cause)
        if (current instanceof HappyAgentApiError && current.code === "profile_required")
            return undefined;
    return error instanceof Error ? error.message : String(error);
}

/** Happy Cloud's Chief of Staff: `done` once its name is confirmed in its chat. */
export interface HappyAgentOnboardingChiefOfStaff {
    readonly done: boolean;
    readonly name: string | null;
    readonly botId: string | null;
}

/**
 * Whether a provider can answer a turn. `readyNow` also counts cooldowns and
 * rate limits, which `done` and `signedIn` leave out.
 */
export interface HappyAgentOnboardingProviders {
    readonly done: boolean;
    readonly signedIn: readonly string[];
    readonly readyNow: boolean;
}

export interface HappyAgentOnboardingState {
    readonly completed: boolean;
    readonly steps: {
        readonly profile: { readonly done: boolean };
        readonly project: { readonly done: boolean };
        readonly providers: { readonly done: boolean; readonly signedIn: readonly string[] };
        /** Present on a Happy Cloud server. */
        readonly chiefOfStaff?: HappyAgentOnboardingChiefOfStaff;
    };
    /**
     * Happy Cloud's server-wide setup: complete once the Chief of Staff is named.
     * Absent on a Happy Agent, where `completed` is the whole answer.
     */
    readonly server?: {
        readonly completed: boolean;
        readonly steps: {
            readonly providers: HappyAgentOnboardingProviders;
            readonly chiefOfStaff: HappyAgentOnboardingChiefOfStaff;
        };
    };
    /**
     * Happy Cloud's setup for the reader: complete once their profile is saved.
     * Naming the Chief of Staff happens in its chat, so a member who has a
     * profile is let into the server without waiting for it.
     */
    readonly member?: {
        readonly completed: boolean;
        readonly steps: {
            readonly profile: { readonly done: boolean };
            readonly providers: HappyAgentOnboardingProviders;
        };
    };
}

/** Invites sent from the teammates gate in this flow. */
export interface HappyAgentOnboardingInvites {
    /** The address typed for the next invite. */
    readonly email: string;
    /** Which invite is being made. */
    readonly creating?: "email" | "link";
    /** Emails sent in this flow, newest first. */
    readonly sent: readonly {
        readonly id: string;
        readonly email: string;
        readonly delivery: "sent" | "failed";
    }[];
    /** A link invite, shown this once: the server keeps none. */
    readonly link?: string;
    /** Why the last invite was not sent, or that a link stands in for email. */
    readonly error?: string;
}

export interface HappyAgentOnboardingSnapshot {
    readonly state?: HappyAgentOnboardingState;
    /** The admin bot's name as typed; absent until edited, when the server's stands. */
    readonly adminBotName?: string;
    readonly invites: HappyAgentOnboardingInvites;
    /** The plugin the plugins gate is installing or signing in. */
    readonly pluginConnecting?: string;
    /**
     * The installation whose sign-in is open over the plugins gate: its
     * plugin asks for fields, or offers more than one way in.
     */
    readonly pluginSetup?: { readonly pluginId: string; readonly installationId: string };
    /**
     * A Happy Cloud server's onboarding gates and where the reader is in them.
     * Absent where the server has no gates; the reader is let in once it has no
     * `current` gate.
     */
    readonly flow?: HappyAgentOnboardingFlow;
    readonly pending: boolean;
    /** Authenticated setup endpoints are ready even before protected sync starts. */
    readonly available: boolean;
    readonly error?: string;
}

export interface HappyAgentOnboardingStore {
    readonly mobile: HappyMobileOnboardingStore;
    get(): HappyAgentOnboardingSnapshot;
    subscribe(listener: () => void): () => void;
    onboardingBegin(): void;
    /**
     * Leaves the gate on screen: it is done, or it is optional and is skipped
     * for the reader (a member gate) or the team (a server gate). A gate that
     * still blocks is read again and left only if the server now says it is done.
     */
    gateContinue(gateId: string, options?: { readonly also?: readonly string[] }): void;
    adminBotNameUpdate(value: string): void;
    /** Names the server's admin bot with the typed name, or keeps its own, then leaves its gate. */
    adminBotNameSubmit(): void;
    inviteEmailUpdate(value: string): void;
    /** Emails an invite to the typed address; a server without email makes a link instead. */
    inviteEmailSend(): void;
    inviteLinkCreate(): void;
    /**
     * Installs a plugin the plugins gate offers, when it is not yet, and sends
     * `target` to its sign-in; the server finishes it and the gate reads again.
     */
    pluginConnect(pluginId: string, target: HappyAgentPluginConnectTarget): void;
    /** Closes the plugin sign-in `pluginConnect` opened; the gate reads again. */
    pluginSetupClose(): void;
    /** Reads the gates again, as when the window comes back to the front. */
    onboardingRead(): void;
    [Symbol.dispose](): void;
}

/** Gates the server completes on its own, from another device or service. */
const GATE_POLL_KINDS: ReadonlySet<HappyAgentOnboardingGate["kind"]> = new Set([
    "mobileApp",
    "paymentMethod",
    "payment",
]);
const GATE_POLL_INTERVAL_MS = 4_000;

function chiefOfStaffEqual(
    left: HappyAgentOnboardingChiefOfStaff | undefined,
    right: HappyAgentOnboardingChiefOfStaff | undefined,
): boolean {
    if (left === right) return true;
    if (!left || !right) return false;
    return left.done === right.done && left.name === right.name && left.botId === right.botId;
}

function providersEqual(
    left: HappyAgentOnboardingProviders,
    right: HappyAgentOnboardingProviders,
): boolean {
    return (
        left.done === right.done &&
        left.readyNow === right.readyNow &&
        left.signedIn.length === right.signedIn.length &&
        left.signedIn.every((provider, index) => provider === right.signedIn[index])
    );
}

function onboardingStatesEqual(
    left: HappyAgentOnboardingSnapshot["state"],
    right: HappyAgentOnboardingSnapshot["state"],
): boolean {
    if (left === right) return true;
    if (!left || !right) return false;
    if (!deepEqual(gatesOf(left), gatesOf(right))) return false;
    if (!chiefOfStaffEqual(left.steps.chiefOfStaff, right.steps.chiefOfStaff)) return false;
    if (left.server !== right.server) {
        if (!left.server || !right.server) return false;
        if (
            left.server.completed !== right.server.completed ||
            !providersEqual(left.server.steps.providers, right.server.steps.providers) ||
            !chiefOfStaffEqual(left.server.steps.chiefOfStaff, right.server.steps.chiefOfStaff)
        )
            return false;
    }
    if (left.member !== right.member) {
        if (!left.member || !right.member) return false;
        if (
            left.member.completed !== right.member.completed ||
            left.member.steps.profile.done !== right.member.steps.profile.done ||
            !providersEqual(left.member.steps.providers, right.member.steps.providers)
        )
            return false;
    }
    return (
        left.completed === right.completed &&
        left.steps.profile.done === right.steps.profile.done &&
        left.steps.project.done === right.steps.project.done &&
        left.steps.providers.done === right.steps.providers.done &&
        left.steps.providers.signedIn.length === right.steps.providers.signedIn.length &&
        left.steps.providers.signedIn.every(
            (provider, index) => provider === right.steps.providers.signedIn[index],
        )
    );
}

/** The server's gates, which the daemon's protocol package does not name. */
function gatesOf(state: HappyAgentOnboardingState): unknown {
    return (state as { readonly gates?: unknown }).gates;
}

/** Remote onboarding follows the daemon's state without scanning providers or requiring a project. */
export function happyAgentOnboardingStoreCreate(
    client: HappyAgentClient,
    sync: HappyAgentSync,
    options: {
        readonly setupActive?: boolean;
        readonly mobileSkipped?: boolean;
        readonly onMobileSkip?: () => void;
        /** The local desktop pairs Happy Mobile through the guided setup. */
        readonly guidedMobileSetup?: boolean;
        /** The connection's direct connector, offered beside the relay code. */
        readonly mobileConnector?: HappyAgentMobileConnectorStore;
        /** Happy Cloud's own routes, which skip gates and name the admin bot. */
        readonly cloudRequest?: HappyCloudRequest;
        /** The server's plugins, which the plugins gate installs. */
        readonly plugins?: () => HappyAgentPluginsStore | undefined;
        /**
         * The reader finished a flow that showed them at least one gate, and the
         * server took the completion; the Chief of Staff opens its first conversation.
         */
        readonly onFinished?: () => void;
    } = {},
): HappyAgentOnboardingStore {
    let snapshot: HappyAgentOnboardingSnapshot = {
        available: false,
        pending: false,
        invites: { email: "", sent: [] },
    };
    const listeners = new Set<() => void>();
    let controller: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let readRequest = 0;
    let setupActive = options.setupActive === true;
    let completion: AbortController | undefined;
    let completionRetry: ReturnType<typeof setTimeout> | undefined;
    let mobileUnsubscribe: (() => void) | undefined;
    const mobile = happyMobileOnboardingStoreCreate({
        client,
        sync,
        initialSkipped: options.mobileSkipped,
        guided: options.guidedMobileSetup,
        onOutput: options.onMobileSkip,
        ...(options.mobileConnector ? { mobileConnector: options.mobileConnector } : {}),
    });
    /** The gate on screen, held until the reader leaves it. */
    let pinned: string | undefined;
    /** Gates the reader left in this flow; the server may still show a blocking one again. */
    const passed = new Set<string>();
    let sequence: readonly string[] = [];
    let gatePending: string | undefined;
    let gateError: { readonly gate: string; readonly message: string } | undefined;
    let gateAction: AbortController | undefined;
    let gatesCompleted = false;
    let gatesCompletion: AbortController | undefined;
    let gatesRetry: ReturnType<typeof setTimeout> | undefined;
    let gatePoll: ReturnType<typeof setTimeout> | undefined;
    const flowOf = (
        state: HappyAgentOnboardingState | undefined,
    ): HappyAgentOnboardingFlow | undefined => {
        const gates = state ? happyAgentOnboardingGatesRead(state, client.endpoint) : undefined;
        if (!gates) return undefined;
        const flow = happyAgentOnboardingFlowDerive({
            gates,
            pinned,
            passed,
            sequence,
            ...(gatePending === undefined ? {} : { pending: gatePending }),
            ...(gateError ? { error: gateError } : {}),
        });
        pinned = flow.current?.id;
        sequence = flow.sequence;
        return flow;
    };
    /** `local` says the flow's own position changed, whatever the server said. */
    const publish = (next: HappyAgentOnboardingSnapshot, local = false): void => {
        const state = onboardingStatesEqual(snapshot.state, next.state)
            ? snapshot.state
            : next.state;
        if (
            !local &&
            state === snapshot.state &&
            next.available === snapshot.available &&
            next.pending === snapshot.pending &&
            next.error === snapshot.error
        )
            return;
        const flow = local || state !== snapshot.state ? flowOf(state) : snapshot.flow;
        const { flow: _previous, ...rest } = next;
        snapshot = { ...rest, state, ...(flow ? { flow } : {}) };
        for (const listener of listeners) listener();
    };
    const reconcile = async (signal: AbortSignal): Promise<void> => {
        const request = ++readRequest;
        const state = await happyAgentSyncRead(
            signal,
            () => client.getOnboarding({ signal }),
            (error) => {
                if (request === readRequest)
                    publish({
                        ...snapshot,
                        available: false,
                        error: error instanceof Error ? error.message : String(error),
                    });
            },
        );
        if (!disposed && !signal.aborted && request === readRequest) {
            publish({ ...snapshot, state, available: true, error: undefined });
            setupSynchronize();
        }
    };
    function setupSynchronize(): void {
        if (snapshot.flow) {
            gatesSynchronize();
            return;
        }
        if (
            !setupActive ||
            disposed ||
            !listeners.size ||
            !snapshot.state ||
            snapshot.state.completed
        )
            return;
        if (!snapshot.state.steps.profile.done) return;
        // Happy Cloud completes on its own once the Chief of Staff is named in
        // its chat, and refuses an earlier completion. Its members need nothing
        // after their profile.
        if (snapshot.state.member) return;
        if (!mobileUnsubscribe) mobileUnsubscribe = mobile.subscribe(setupSynchronize);
        const status = mobile.get().status;
        // Remote setup ends here. Its first project is created later in the workspace.
        if (status === "configured" || status === "disabled" || status === "skipped")
            onboardingComplete();
    }
    /**
     * Once no gate is left to show, the server is told the reader finished.
     * The call is idempotent, so a reader who had nothing to do sends it too;
     * only one who walked through gates is taken to the Chief of Staff after.
     */
    function gatesSynchronize(): void {
        const flow = snapshot.flow;
        if (disposed || !listeners.size || !flow) return;
        gatePollSchedule(flow);
        if (flow.current || gatesCompleted || gatesCompletion || gatesRetry) return;
        const active = new AbortController();
        gatesCompletion = active;
        void client
            .completeOnboarding({ signal: active.signal })
            .then(() => {
                gatesCompleted = true;
                if (passed.size) options.onFinished?.();
            })
            .catch(() => {
                // Nothing blocks the reader any more, so they are already in;
                // the completion only has to reach the server eventually.
                if (!active.signal.aborted && !disposed)
                    gatesRetry = setTimeout(() => {
                        gatesRetry = undefined;
                        setupSynchronize();
                    }, 2_000);
            })
            .finally(() => {
                if (gatesCompletion === active) gatesCompletion = undefined;
            });
    }
    /**
     * A gate another device or service completes, or only an admin can, has no
     * event this client is sure to hear, so it is read again while on screen.
     */
    function gatePollSchedule(flow: HappyAgentOnboardingFlow): void {
        const current = flow.current;
        if (
            gatePoll ||
            !current ||
            !controller ||
            (!GATE_POLL_KINDS.has(current.kind) && flow.stance === "act")
        )
            return;
        gatePoll = setTimeout(() => {
            gatePoll = undefined;
            const active = controller;
            if (active && !disposed) void reconcile(active.signal).catch(() => undefined);
        }, GATE_POLL_INTERVAL_MS);
    }
    function gateLeave(gateId: string): void {
        passed.add(gateId);
        if (pinned === gateId) pinned = undefined;
        gateError = undefined;
        publish(snapshot, true);
        setupSynchronize();
    }
    /** Runs one action on the gate on screen, with its refusal said on that gate. */
    function gateRun(gateId: string, work: (signal: AbortSignal) => Promise<void>): void {
        if (gatePending !== undefined || disposed) return;
        const active = new AbortController();
        gateAction = active;
        gatePending = gateId;
        gateError = undefined;
        publish(snapshot, true);
        void work(active.signal)
            .catch((error: unknown) => {
                if (!active.signal.aborted)
                    gateError = { gate: gateId, message: happyAgentUserError(error).message };
            })
            .finally(() => {
                if (gateAction !== active) return;
                gateAction = undefined;
                gatePending = undefined;
                if (disposed) return;
                publish(snapshot, true);
                setupSynchronize();
            });
    }
    /**
     * Leaves the gate on screen: one that is done goes; an optional one is
     * skipped; one that blocks is read again and goes if the server now says
     * it is done. `first` says the reader asked for this gate; a gate named in
     * `also` is passed only if it is the one on screen by then.
     */
    async function gateLeaveOrSkip(
        gateId: string,
        signal: AbortSignal,
        first: boolean,
    ): Promise<boolean> {
        const gate = snapshot.flow?.current;
        if (!gate || gate.id !== gateId) return !first;
        if (gate.status === "done" || gate.status === "skipped") {
            gateLeave(gateId);
            return true;
        }
        if (!gate.blocking && gate.kind !== "unknown") {
            const state = await cloud()(
                "POST",
                `v0/onboarding/gates/${encodeURIComponent(gateId)}/skip`,
                {},
            );
            if (signal.aborted) return false;
            publish({ ...snapshot, state: state as HappyAgentOnboardingState, available: true });
            gateLeave(gateId);
            return true;
        }
        // A step finished elsewhere may not have been heard about yet.
        await gatesRead(signal);
        const after = snapshot.flow?.current;
        if (signal.aborted || after?.id !== gateId || after.blocking) return false;
        gateLeave(gateId);
        return true;
    }
    /** Makes one invite with the member role; `email` absent makes a link. */
    function inviteCreate(email: string | undefined, notice?: string): void {
        const request = options.cloudRequest;
        if (!request || disposed) return;
        const { error: _cleared, ...invites } = snapshot.invites;
        publish(
            {
                ...snapshot,
                invites: {
                    ...invites,
                    creating: email ? "email" : "link",
                    ...(notice ? { error: notice } : {}),
                },
            },
            true,
        );
        void request("POST", "v0/invites", {
            ...(email ? { email } : {}),
            mutationId: crypto.randomUUID(),
        })
            .then((answer) => {
                if (disposed) return;
                const invite = (answer as { readonly invite?: Record<string, unknown> }).invite;
                const id = typeof invite?.id === "string" ? invite.id : crypto.randomUUID();
                const { creating: _done, ...rest } = snapshot.invites;
                publish(
                    {
                        ...snapshot,
                        invites: email
                            ? {
                                  ...rest,
                                  email: "",
                                  sent: [
                                      {
                                          id,
                                          email,
                                          delivery:
                                              invite?.deliveryStatus === "failed"
                                                  ? "failed"
                                                  : "sent",
                                      },
                                      ...rest.sent,
                                  ],
                              }
                            : {
                                  ...rest,
                                  ...(typeof invite?.link === "string"
                                      ? { link: invite.link }
                                      : {}),
                              },
                    },
                    true,
                );
            })
            .catch((error: unknown) => {
                if (disposed) return;
                const refused = happyAgentUserError(error);
                const { creating: _done, ...rest } = snapshot.invites;
                if (email && refused.code === "email_not_configured") {
                    inviteCreate(
                        undefined,
                        "This server can't send email. Share this link instead.",
                    );
                    return;
                }
                publish({ ...snapshot, invites: { ...rest, error: refused.message } }, true);
            });
    }
    const cloud = (): HappyCloudRequest => {
        if (!options.cloudRequest) throw new Error("This server has no onboarding gates.");
        return options.cloudRequest;
    };
    /** Reads the gates once now, for an action that must see the server's answer. */
    const gatesRead = async (signal: AbortSignal): Promise<void> => {
        const state = await client.getOnboarding({ signal });
        if (!signal.aborted && !disposed) publish({ ...snapshot, state, available: true });
    };
    function onboardingComplete(): void {
        if (
            completion ||
            completionRetry ||
            disposed ||
            !listeners.size ||
            snapshot.state?.completed
        )
            return;
        const active = new AbortController();
        completion = active;
        publish({ ...snapshot, pending: true, error: undefined });
        // The SDK declares completion idempotent. An outage must not strand the
        // person on the finishing screen or require a manual refresh.
        void client
            .completeOnboarding({ signal: active.signal })
            .then(() => reconcile(active.signal))
            .catch((error: unknown) => {
                if (!active.signal.aborted)
                    publish({
                        ...snapshot,
                        error: error instanceof Error ? error.message : String(error),
                    });
            })
            .finally(() => {
                if (completion !== active) return;
                completion = undefined;
                if (!active.signal.aborted && !disposed) {
                    if (!snapshot.state?.completed && listeners.size)
                        completionRetry = setTimeout(() => {
                            completionRetry = undefined;
                            setupSynchronize();
                        }, 2_000);
                    publish({ ...snapshot, pending: false });
                }
            });
    }
    const start = (): void => {
        if (controller || disposed || !listeners.size) return;
        const active = new AbortController();
        controller = active;
        void (async () => {
            for await (const input of sync.follow({
                signal: active.signal,
                events: [
                    "config.updated",
                    "profile.updated",
                    "project.created",
                    "project.updated",
                    "bot.updated",
                    "plugins.changed",
                    "invite.created",
                    "member.updated",
                    "member.removed",
                    "onboarding.updated",
                ],
                onOnboarding: (input) => {
                    ++readRequest;
                    if (!input) {
                        publish({ ...snapshot, available: false, error: undefined });
                        return;
                    }
                    publish({
                        ...snapshot,
                        state: input.onboarding,
                        available: true,
                        error: undefined,
                    });
                    setupSynchronize();
                },
            })) {
                try {
                    if (input.kind === "error") throw input.error;
                    if (input.kind === "bootstrap") {
                        ++readRequest;
                        publish({
                            ...snapshot,
                            state: input.bootstrap.onboarding,
                            available: true,
                            error: undefined,
                        });
                        setupSynchronize();
                    } else if (input.kind === "update" && input.update.kind === "connected") {
                        publish({ ...snapshot, available: true });
                        if (snapshot.error) await reconcile(active.signal);
                    } else if (
                        input.kind === "update" &&
                        (input.update.kind === "disconnected" || input.update.kind === "draining")
                    ) {
                        publish({ ...snapshot, available: false });
                    } else if (input.kind === "reconcile" || input.update.kind === "event")
                        await reconcile(active.signal);
                } catch (error) {
                    if (!active.signal.aborted) {
                        const { error: _previous, ...rest } = snapshot;
                        const message = onboardingErrorOf(error);
                        publish({
                            ...rest,
                            available: false,
                            ...(message === undefined ? {} : { error: message }),
                        });
                    }
                }
            }
        })()
            .catch((error: unknown) => {
                if (!active.signal.aborted) {
                    const { error: _previous, ...rest } = snapshot;
                    const message = onboardingErrorOf(error);
                    publish({
                        ...rest,
                        available: false,
                        ...(message === undefined ? {} : { error: message }),
                    });
                }
            })
            .finally(() => {
                if (controller === active) controller = undefined;
                if (!active.signal.aborted && !disposed && listeners.size)
                    retry = setTimeout(start, 1_000);
            });
    };
    const stop = (): void => {
        controller?.abort();
        controller = undefined;
        completion?.abort();
        completion = undefined;
        if (completionRetry) clearTimeout(completionRetry);
        completionRetry = undefined;
        gateAction?.abort();
        gateAction = undefined;
        gatePending = undefined;
        gatesCompletion?.abort();
        gatesCompletion = undefined;
        if (gatesRetry) clearTimeout(gatesRetry);
        gatesRetry = undefined;
        if (gatePoll) clearTimeout(gatePoll);
        gatePoll = undefined;
        snapshot = { ...snapshot, available: false, pending: false };
        mobileUnsubscribe?.();
        mobileUnsubscribe = undefined;
        if (retry) clearTimeout(retry);
        retry = undefined;
    };
    return {
        mobile,
        get: () => snapshot,
        onboardingBegin() {
            setupActive = true;
            setupSynchronize();
        },
        gateContinue(gateId, continueOptions) {
            const gate = snapshot.flow?.current;
            if (!gate || gate.id !== gateId || gatePending !== undefined) return;
            gateRun(gateId, async (signal) => {
                for (const id of [gateId, ...(continueOptions?.also ?? [])]) {
                    if (!(await gateLeaveOrSkip(id, signal, id === gateId))) return;
                }
            });
        },
        adminBotNameUpdate(value) {
            publish({ ...snapshot, adminBotName: value }, true);
        },
        inviteEmailUpdate(value) {
            const { error: _cleared, ...invites } = snapshot.invites;
            publish({ ...snapshot, invites: { ...invites, email: value } }, true);
        },
        inviteEmailSend() {
            const email = snapshot.invites.email.trim();
            if (email === "" || snapshot.invites.creating) return;
            inviteCreate(email);
        },
        inviteLinkCreate() {
            if (!snapshot.invites.creating) inviteCreate(undefined);
        },
        pluginConnect(pluginId, target) {
            if (snapshot.flow?.current?.kind !== "plugins") return;
            const gateId = snapshot.flow.current.id;
            publish({ ...snapshot, pluginConnecting: pluginId }, true);
            gateRun(gateId, async () => {
                try {
                    const plugins = options.plugins?.();
                    if (!plugins) throw new UserError("This server has no plugins.");
                    const { plugins: catalog, installations } = plugins.get();
                    const plugin = catalog.find((entry) => entry.id === pluginId);
                    const installed = installations.find(
                        (entry) => entry.pluginId === pluginId && entry.available,
                    );
                    if (installed?.status === "active") return;
                    const installationId = installed?.id ?? (await plugins.pluginInstall(pluginId));
                    const methods = plugin?.authMethods ?? [];
                    if (plugin && !plugin.authRequired && methods.length === 0) return;
                    // One OAuth sign-in goes straight to the browser; fields, or a
                    // choice of ways in, are asked for over the gate.
                    const only = methods.length === 1 ? methods[0] : undefined;
                    if (only?.type === "oauth") {
                        await plugins.installationConnect(installationId, only.id, target);
                        return;
                    }
                    if (methods.length === 0)
                        throw new UserError(
                            `${plugin?.name ?? "This plugin"} has no way to sign in on this server.`,
                        );
                    snapshot = { ...snapshot, pluginSetup: { pluginId, installationId } };
                } finally {
                    const { pluginConnecting: _done, ...rest } = snapshot;
                    snapshot = rest;
                }
            });
        },
        pluginSetupClose() {
            if (!snapshot.pluginSetup) return;
            const { pluginSetup: _closed, ...rest } = snapshot;
            publish(rest, true);
            const active = controller;
            if (active && !disposed) void reconcile(active.signal).catch(() => undefined);
        },
        onboardingRead() {
            const active = controller;
            if (active && !disposed) void reconcile(active.signal).catch(() => undefined);
        },
        adminBotNameSubmit() {
            const gate = snapshot.flow?.current;
            if (gate?.kind !== "adminBot") return;
            const trimmed = (snapshot.adminBotName ?? gate.name).trim();
            if (gate?.kind !== "adminBot" || trimmed === "" || gate.botId === "") return;
            gateRun(gate.id, async (signal) => {
                const rename = (version: string) =>
                    cloud()(
                        "PATCH",
                        `v0/bots/${encodeURIComponent(gate.botId)}`,
                        { name: trimmed },
                        version === "" ? undefined : { "if-match": version },
                    );
                try {
                    await rename(gate.version);
                } catch (error) {
                    // Someone else changed the bot since this screen read it:
                    // read its version again and rename that one, once.
                    if (!(error instanceof HappyCloudRequestRefusal) || error.status !== 409)
                        throw error;
                    await gatesRead(signal);
                    const current = snapshot.flow?.gates.find((item) => item.id === gate.id);
                    if (current?.kind !== "adminBot") return;
                    await rename(current.version);
                }
                await gatesRead(signal);
                if (!signal.aborted) gateLeave(gate.id);
            });
        },
        subscribe(listener) {
            listeners.add(listener);
            start();
            return () => {
                listeners.delete(listener);
                if (!listeners.size) stop();
            };
        },
        [Symbol.dispose]() {
            disposed = true;
            stop();
            mobile[Symbol.dispose]();
            listeners.clear();
        },
    };
}
