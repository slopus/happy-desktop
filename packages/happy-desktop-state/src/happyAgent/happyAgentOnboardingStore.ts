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
    happyAgentOnboardingSummaryRead,
    type HappyAgentOnboardingFlow,
    type HappyAgentOnboardingGate,
} from "./happyAgentOnboardingGates.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "./happyAgentProviderCredentials.js";
import { HAPPY_AGENT_PLUGIN_GITHUB, type HappyAgentPluginJob } from "./happyAgentPluginJobs.js";
import {
    HappyAgentPluginFieldsError,
    type HappyAgentPluginConnectTarget,
    type HappyAgentPluginsStore,
} from "./happyAgentPluginsStore.js";
import {
    happyAgentPicturePickStoreCreate,
    type HappyAgentPicturePickStore,
} from "./happyAgentPicturePickStore.js";
import type { HappyAgentProfilePhotoCodec } from "./happyAgentProfilePhoto.js";
import type { HappyAgentAvatarImage } from "./happyAgentTypes.js";
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

/** A plugin's sign-in form open over the plugins gate. */
export interface HappyAgentOnboardingPluginForm {
    readonly pluginId: string;
    /** The fields method being filled in; a plugin may offer more than one. */
    readonly methodId: string;
    /** What is typed, by field key. It goes nowhere but the server's setup. */
    readonly values: ReadonlyMap<string, string>;
    /** Why the server refused the last submit, and what is wrong with each field by key. */
    readonly refusal?: {
        readonly message: string;
        readonly fields: ReadonlyMap<string, string>;
    };
}

/**
 * The dialog open over the plugins gate. `github` explains the GitHub App and
 * sends the person to GitHub, with the token form a view behind it, or alone
 * where the server does not offer the App. `job` lists one job's tools, and a
 * tool's form opens in the same dialog; `rest` lists the tools no job claims.
 */
export type HappyAgentOnboardingPluginDialog =
    | {
          readonly kind: "github";
          /** GitHub's page was opened and the installation is not active yet. */
          readonly waiting: boolean;
          readonly form?: HappyAgentOnboardingPluginForm;
          /** Why sending the person to GitHub failed. */
          readonly error?: string;
      }
    | {
          readonly kind: "job";
          readonly job: Exclude<HappyAgentPluginJob, "code"> | "rest";
          readonly form?: HappyAgentOnboardingPluginForm;
      };

export interface HappyAgentOnboardingSnapshot {
    readonly state?: HappyAgentOnboardingState;
    /** The admin bot's name as typed; absent until edited, when the server's stands. */
    readonly adminBotName?: string;
    readonly invites: HappyAgentOnboardingInvites;
    /** The plugin the plugins gate is installing or signing in. */
    readonly pluginConnecting?: string;
    readonly pluginDialog?: HappyAgentOnboardingPluginDialog;
    /**
     * A Happy Cloud server's onboarding gates and where the reader is in them.
     * Absent where the server has no gates; the reader is let in once it has no
     * `current` gate.
     */
    readonly flow?: HappyAgentOnboardingFlow;
    /**
     * The reader finished, and the admin bot they would be taken to works only
     * with the people who manage bots: a last page says so before the app opens.
     */
    readonly finale?: { readonly botName: string };
    readonly pending: boolean;
    /** Authenticated setup endpoints are ready even before protected sync starts. */
    readonly available: boolean;
    readonly error?: string;
}

export interface HappyAgentOnboardingStore {
    readonly mobile: HappyMobileOnboardingStore;
    /**
     * The admin bot gate's picture, sent as soon as it is cropped. Absent
     * without a way to crop pictures or reach Happy Cloud's routes.
     */
    readonly adminBotPicture?: HappyAgentPicturePickStore;
    get(): HappyAgentOnboardingSnapshot;
    subscribe(listener: () => void): () => void;
    onboardingBegin(): void;
    /**
     * Leaves the gate on screen: it is done, or it is optional and is skipped
     * for the reader (a member gate) or the team (a server gate). A gate that
     * still blocks is read again and left only if the server now says it is done.
     * After Back, it goes to the step after this one instead, one step at a
     * time, until the step Back was first pressed on is on screen again.
     */
    gateContinue(gateId: string): void;
    /** Puts the step before the one on screen back on screen; nothing on the first. */
    gateBack(): void;
    /**
     * Leaves setup to finish later. Nothing is sent: what is done is the
     * server's already, and the steps still open stay open.
     */
    onboardingExit(): void;
    /** Returns to setup at the first step still open. */
    onboardingResume(): void;
    /** The card that opened as the reader left setup was closed; it no longer opens by itself. */
    awayCardClose(): void;
    adminBotNameUpdate(value: string): void;
    /** Names the server's admin bot with the typed name, or keeps its own, then leaves its gate. */
    adminBotNameSubmit(): void;
    inviteEmailUpdate(value: string): void;
    /** Emails an invite to the typed address; a server without email makes a link instead. */
    inviteEmailSend(): void;
    inviteLinkCreate(): void;
    /**
     * Opens GitHub's dialog, on its token form where the server does not
     * offer the GitHub App, or one job's list of tools.
     */
    pluginDialogOpen(
        dialog:
            | { readonly kind: "github" }
            | { readonly kind: "job"; readonly job: Exclude<HappyAgentPluginJob, "code"> | "rest" },
    ): void;
    /** Closes the dialog; nothing typed is kept. The gate reads again. */
    pluginDialogClose(): void;
    /** From a form back to the view it was opened from: the job's list, or GitHub's App. */
    pluginDialogBack(): void;
    /** Opens a plugin's sign-in form in the dialog, on its first fields method. */
    pluginFormOpen(pluginId: string): void;
    /** Switches the open form to another of its plugin's fields methods. */
    pluginFormMethodSelect(methodId: string): void;
    pluginFormValueUpdate(key: string, value: string): void;
    /**
     * Installs the form's plugin for the team when it is not yet, and signs
     * it in with what is typed. Done, GitHub's dialog closes and a job's
     * returns to its list; refused, the form says why.
     */
    pluginFormSubmit(): void;
    /**
     * Installs a plugin when it is not yet and sends `target` to its browser
     * sign-in; the server finishes it and the gate reads again. Sent again,
     * it opens the page again.
     */
    pluginSignInOpen(pluginId: string, target: HappyAgentPluginConnectTarget): void;
    /** Leaves the last page for the app. */
    finaleDismiss(): void;
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
    if (!deepEqual(onboardingGatesOf(left), onboardingGatesOf(right))) return false;
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
/** The parts of the onboarding answer the gate flow reads. */
function onboardingGatesOf(state: HappyAgentOnboardingState): unknown {
    const body = state as { readonly gates?: unknown; finished?: unknown; owners?: unknown };
    return { gates: body.gates, finished: body.finished, owners: body.owners };
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
        /** The connection's direct connector, whose code the phone step offers. */
        readonly mobileConnector?: HappyAgentMobileConnectorStore;
        /** Happy Cloud's own routes, which skip gates and name the admin bot. */
        readonly cloudRequest?: HappyCloudRequest;
        /** Decodes and crops the pictures the admin bot gate is given. */
        readonly photoCodec?: HappyAgentProfilePhotoCodec;
        /** The server's plugins, which the plugins gate installs. */
        readonly plugins?: () => HappyAgentPluginsStore | undefined;
        /** The reader left this server's setup to finish later, on an earlier run. */
        readonly away?: boolean;
        /** The reader left setup for later, or came back to it. */
        readonly onAwayChange?: (away: boolean) => void;
        /**
         * The reader finished a flow that showed them at least one gate and
         * included the admin bot gate, and the server took the completion; the
         * Chief of Staff opens its first conversation.
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
    /**
     * The step Back was first pressed on. While it is set, Continue walks
     * forward one step at a time, so Back then Continue is where the reader was.
     */
    let returnTo: string | undefined;
    let away: "now" | "earlier" | undefined = options.away ? "earlier" : undefined;
    /** The flow ended while the reader was away: they are at work in the app, not walking it. */
    let finishedAway = false;
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
        const { finished, owners } = happyAgentOnboardingSummaryRead(state);
        const flow = happyAgentOnboardingFlowDerive({
            gates,
            ...(finished === undefined ? {} : { finished }),
            owners,
            pinned,
            passed,
            ...(away ? { away } : {}),
            ...(gatePending === undefined ? {} : { pending: gatePending }),
            ...(gateError ? { error: gateError } : {}),
        });
        // Nothing is held on screen while the reader is away: they return to
        // the first step still open, and to none once the rest was done elsewhere.
        pinned = away ? undefined : flow.current?.id;
        if (returnTo !== undefined && !flow.sequence.includes(returnTo)) returnTo = undefined;
        if (away && !flow.current) {
            finishedAway = true;
            awaySet(undefined);
        }
        return flow;
    };
    function awaySet(next: "now" | undefined): void {
        if (away === next) return;
        away = next;
        options.onAwayChange?.(next !== undefined);
    }
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
        const { flow: _previous, pluginDialog, ...rest } = next;
        // GitHub sent the person back connected: the dialog that sent them there is done.
        const gate = flow?.current;
        const connected =
            pluginDialog?.kind === "github" &&
            pluginDialog.waiting &&
            gate?.kind === "plugins" &&
            gate.plugins.some((entry) => entry.id === HAPPY_AGENT_PLUGIN_GITHUB && entry.active);
        snapshot = {
            ...rest,
            state,
            ...(flow ? { flow } : {}),
            ...(pluginDialog && !connected ? { pluginDialog } : {}),
        };
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
        if (status === "configured" || status === "skipped") onboardingComplete();
    }
    /**
     * Once no gate is left to show, the server is told the reader finished.
     * The call is idempotent, so a reader who had nothing to do sends it too;
     * only one who walked through gates and was sent the admin bot gate is
     * taken to the Chief of Staff after.
     */
    function gatesSynchronize(): void {
        const flow = snapshot.flow;
        if (disposed || !listeners.size || !flow) return;
        gatePollSchedule(flow);
        if (flow.current || gatesCompleted || gatesCompletion || gatesRetry) return;
        const active = new AbortController();
        gatesCompletion = active;
        // A reader whose last steps were finished elsewhere while they were
        // away is at work in the app, and is not taken out of it.
        const walked = passed.size > 0 && !away && !finishedAway;
        void client
            .completeOnboarding({ signal: active.signal })
            .then(() => {
                gatesCompleted = true;
                if (!walked) return;
                // A reader sent no admin bot gate, as a plain member is, lands
                // home. One the server says may not talk to the admin bot is
                // told so; one whose server does not say is taken to it.
                const adminBot = flow.gates.find((gate) => gate.kind === "adminBot");
                if (adminBot?.kind !== "adminBot") return;
                if (adminBot.canTalk === false)
                    publish({ ...snapshot, finale: { botName: adminBot.name } }, true);
                else options.onFinished?.();
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
        if (pinned === gateId) {
            const steps = snapshot.flow?.sequence ?? [];
            pinned = returnTo === undefined ? undefined : steps[steps.indexOf(gateId) + 1];
            if (pinned === undefined || pinned === returnTo) returnTo = undefined;
        }
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
     * it is done.
     */
    async function gateLeaveOrSkip(gateId: string, signal: AbortSignal): Promise<void> {
        const gate = snapshot.flow?.current;
        if (!gate || gate.id !== gateId) return;
        if (gate.status === "done" || gate.status === "skipped") {
            gateLeave(gateId);
            return;
        }
        if (!gate.blocking && gate.kind !== "unknown") {
            const state = await cloud()(
                "POST",
                `v0/onboarding/gates/${encodeURIComponent(gateId)}/skip`,
                {},
            );
            if (signal.aborted) return;
            publish({ ...snapshot, state: state as HappyAgentOnboardingState, available: true });
            gateLeave(gateId);
            return;
        }
        // A step finished elsewhere may not have been heard about yet.
        await gatesRead(signal);
        const after = snapshot.flow?.current;
        if (signal.aborted || after?.id !== gateId || after.blocking) return;
        gateLeave(gateId);
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
    const pluginsOf = (): HappyAgentPluginsStore => {
        const plugins = options.plugins?.();
        if (!plugins) throw new UserError("This server has no plugins.");
        return plugins;
    };
    /** The team's installation of a plugin, made now when it has none. */
    const pluginInstallation = async (
        plugins: HappyAgentPluginsStore,
        pluginId: string,
    ): Promise<string> => {
        const installed = plugins
            .get()
            .installations.find((entry) => entry.pluginId === pluginId && entry.available);
        return installed?.id ?? (await plugins.pluginInstall(pluginId));
    };
    /** The method a plugin signs in with in the browser on this server, if it has one. */
    const pluginBrowserSignIn = (pluginId: string): string | undefined =>
        options
            .plugins?.()
            ?.get()
            .plugins.find((entry) => entry.id === pluginId)
            ?.authMethods.find((method) => method.type === "oauth")?.id;
    /** An empty form for one of a plugin's fields methods, its first unless one is named. */
    const pluginFormFor = (
        pluginId: string,
        methodId?: string,
    ): HappyAgentOnboardingPluginForm | undefined => {
        const methods =
            options
                .plugins?.()
                ?.get()
                .plugins.find((entry) => entry.id === pluginId)
                ?.authMethods.filter((method) => method.type === "fields") ?? [];
        const method = methods.find((entry) => entry.id === methodId) ?? methods[0];
        return method ? { pluginId, methodId: method.id, values: new Map() } : undefined;
    };
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
    /**
     * Gives the admin bot the picture just cropped for it, off to one side of
     * the gate: Continue never waits on it. Its version is read again and the
     * picture sent once more if someone changed the bot in the meantime, and
     * the gates are read after, so the picture the server keeps is shown.
     */
    const adminBotPictureSend = async (image: HappyAgentAvatarImage): Promise<void> => {
        const gate = snapshot.flow?.current;
        if (gate?.kind !== "adminBot" || gate.botId === "") return;
        const signal = controller?.signal ?? new AbortController().signal;
        const send = (version: string) =>
            cloud()(
                "PUT",
                `v0/bots/${encodeURIComponent(gate.botId)}/avatar`,
                new Blob([image.data], { type: image.contentType }),
                {
                    "content-type": image.contentType,
                    ...(version === "" ? {} : { "if-match": version }),
                },
            );
        try {
            try {
                await send(gate.version);
            } catch (error) {
                if (!(error instanceof HappyCloudRequestRefusal) || error.status !== 409)
                    throw error;
                await gatesRead(signal);
                const current = snapshot.flow?.gates.find((item) => item.id === gate.id);
                if (current?.kind !== "adminBot") return;
                await send(current.version);
            }
        } catch (error) {
            throw new UserError(
                "The picture didn't upload. You can change it later.",
                undefined,
                error,
            );
        }
        await gatesRead(signal).catch(() => undefined);
    };
    const adminBotPicture =
        options.photoCodec && options.cloudRequest
            ? happyAgentPicturePickStoreCreate({
                  codec: options.photoCodec,
                  onPicked: adminBotPictureSend,
              })
            : undefined;
    return {
        mobile,
        ...(adminBotPicture ? { adminBotPicture } : {}),
        get: () => snapshot,
        onboardingBegin() {
            setupActive = true;
            setupSynchronize();
        },
        gateContinue(gateId) {
            const gate = snapshot.flow?.current;
            if (!gate || gate.id !== gateId || gatePending !== undefined) return;
            gateRun(gateId, (signal) => gateLeaveOrSkip(gateId, signal));
        },
        gateBack() {
            const flow = snapshot.flow;
            if (!flow?.current || flow.previous === undefined || gatePending !== undefined) return;
            returnTo ??= flow.current.id;
            pinned = flow.previous;
            gateError = undefined;
            publish(snapshot, true);
            setupSynchronize();
        },
        onboardingExit() {
            if (!snapshot.flow?.current || away) return;
            awaySet("now");
            pinned = undefined;
            returnTo = undefined;
            publish(snapshot, true);
            // Leaving on a last step already done ends the flow here.
            setupSynchronize();
        },
        awayCardClose() {
            if (away !== "now") return;
            away = "earlier";
            publish(snapshot, true);
        },
        onboardingResume() {
            if (!away) return;
            awaySet(undefined);
            publish(snapshot, true);
            setupSynchronize();
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
        pluginDialogOpen(dialog) {
            if (snapshot.flow?.current?.kind !== "plugins") return;
            if (dialog.kind === "job") {
                publish({ ...snapshot, pluginDialog: { kind: "job", job: dialog.job } }, true);
                return;
            }
            // Without the App, the token is the only way in, so its form is the dialog.
            const form = pluginBrowserSignIn(HAPPY_AGENT_PLUGIN_GITHUB)
                ? undefined
                : pluginFormFor(HAPPY_AGENT_PLUGIN_GITHUB);
            publish(
                {
                    ...snapshot,
                    pluginDialog: { kind: "github", waiting: false, ...(form ? { form } : {}) },
                },
                true,
            );
        },
        pluginDialogClose() {
            if (!snapshot.pluginDialog) return;
            const { pluginDialog: _closed, ...rest } = snapshot;
            publish(rest, true);
            const active = controller;
            if (active && !disposed) void reconcile(active.signal).catch(() => undefined);
        },
        pluginDialogBack() {
            const dialog = snapshot.pluginDialog;
            if (!dialog?.form) return;
            if (dialog.kind === "github" && !pluginBrowserSignIn(HAPPY_AGENT_PLUGIN_GITHUB)) return;
            const { form: _left, ...rest } = dialog;
            publish({ ...snapshot, pluginDialog: rest }, true);
        },
        pluginFormOpen(pluginId) {
            const dialog = snapshot.pluginDialog;
            const form = pluginFormFor(pluginId);
            if (!dialog || !form) return;
            publish({ ...snapshot, pluginDialog: { ...dialog, form } }, true);
        },
        pluginFormMethodSelect(methodId) {
            const dialog = snapshot.pluginDialog;
            if (!dialog?.form || dialog.form.methodId === methodId) return;
            const form = pluginFormFor(dialog.form.pluginId, methodId);
            if (form) publish({ ...snapshot, pluginDialog: { ...dialog, form } }, true);
        },
        pluginFormValueUpdate(key, value) {
            const dialog = snapshot.pluginDialog;
            if (!dialog?.form) return;
            const { refusal: _cleared, ...form } = dialog.form;
            publish(
                {
                    ...snapshot,
                    pluginDialog: {
                        ...dialog,
                        form: { ...form, values: new Map(form.values).set(key, value) },
                    },
                },
                true,
            );
        },
        pluginFormSubmit() {
            const dialog = snapshot.pluginDialog;
            const form = dialog?.form;
            if (!dialog || !form || snapshot.pluginConnecting !== undefined || disposed) return;
            const { refusal: _cleared, ...sent } = form;
            publish(
                {
                    ...snapshot,
                    pluginConnecting: form.pluginId,
                    pluginDialog: { ...dialog, form: sent },
                },
                true,
            );
            /** The form is still the one sent, so what the server said is said on it. */
            const onForm = (): HappyAgentOnboardingPluginDialog | undefined => {
                const current = snapshot.pluginDialog;
                return current?.form?.pluginId === form.pluginId &&
                    current.form.methodId === form.methodId
                    ? current
                    : undefined;
            };
            void (async () => {
                const plugins = pluginsOf();
                const installationId = await pluginInstallation(plugins, form.pluginId);
                await plugins.installationConfigure(installationId, form.methodId, form.values);
            })()
                .then(
                    () => {
                        const current = onForm();
                        if (!current) return;
                        if (current.kind === "github") {
                            const { pluginDialog: _done, ...rest } = snapshot;
                            snapshot = rest;
                            return;
                        }
                        const { form: _done, ...list } = current;
                        snapshot = { ...snapshot, pluginDialog: list };
                    },
                    (error: unknown) => {
                        const current = onForm();
                        if (!current?.form) return;
                        const refusal =
                            error instanceof HappyAgentPluginFieldsError
                                ? { message: error.message, fields: error.fields }
                                : {
                                      message: happyAgentUserError(error).message,
                                      fields: new Map<string, string>(),
                                  };
                        snapshot = {
                            ...snapshot,
                            pluginDialog: { ...current, form: { ...current.form, refusal } },
                        };
                    },
                )
                .finally(() => {
                    if (disposed) return;
                    const { pluginConnecting: _done, ...rest } = snapshot;
                    publish(rest, true);
                    const active = controller;
                    if (active) void reconcile(active.signal).catch(() => undefined);
                });
        },
        pluginSignInOpen(pluginId, target) {
            const gate = snapshot.flow?.current;
            if (gate?.kind !== "plugins" || snapshot.pluginConnecting !== undefined || disposed)
                return;
            const dialog = snapshot.pluginDialog;
            if (dialog?.kind === "github") {
                const { error: _cleared, ...github } = dialog;
                snapshot = { ...snapshot, pluginDialog: github };
            }
            publish({ ...snapshot, pluginConnecting: pluginId }, true);
            void (async () => {
                const plugins = pluginsOf();
                const method = pluginBrowserSignIn(pluginId);
                if (!method) {
                    const name = plugins.get().plugins.find((entry) => entry.id === pluginId)?.name;
                    throw new UserError(
                        `${name ?? "This plugin"} has no sign-in in the browser on this server.`,
                    );
                }
                const installationId = await pluginInstallation(plugins, pluginId);
                await plugins.installationConnect(installationId, method, target);
            })()
                .then(
                    () => {
                        const current = snapshot.pluginDialog;
                        if (current?.kind === "github")
                            snapshot = { ...snapshot, pluginDialog: { ...current, waiting: true } };
                    },
                    (error: unknown) => {
                        const message = happyAgentUserError(error).message;
                        const current = snapshot.pluginDialog;
                        if (current?.kind === "github")
                            snapshot = {
                                ...snapshot,
                                pluginDialog: { ...current, error: message },
                            };
                        else gateError = { gate: gate.id, message };
                    },
                )
                .finally(() => {
                    if (disposed) return;
                    const { pluginConnecting: _done, ...rest } = snapshot;
                    publish(rest, true);
                });
        },
        finaleDismiss() {
            if (!snapshot.finale) return;
            const { finale: _left, ...rest } = snapshot;
            publish(rest, true);
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
            adminBotPicture?.[Symbol.dispose]();
            listeners.clear();
        },
    };
}
