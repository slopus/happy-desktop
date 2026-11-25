import {
    GPT_LIVE_PROBLEMS,
    type GptLiveAvailability,
    type GptLiveCall,
    type GptLiveOutputLevels,
    type GptLiveProblem,
    type GptLiveRuntimeEvent,
    type GptLiveRuntimes,
    type GptLiveTranscriptFragment,
    type GptLiveVoiceFocus,
} from "./gptLiveRuntime.js";
import type { ExperimentsStore } from "../experiments/experimentsStore.js";
import { UserError } from "../types.js";

/** A desktop preference, independent of any coding session or provider default. */
export interface GptLiveDocument {
    readonly gptLiveEnabled: boolean;
    /** The voice account chosen on each agent, by connection ID. */
    readonly accountIds?: Readonly<Record<string, string>>;
}

export interface GptLivePersistence {
    read(): GptLiveDocument | undefined;
    write(document: GptLiveDocument): void;
}

/**
 * The window's one call, bound to the agent that hosts it. `ended` keeps why a
 * call could not start or stopped until the person ends it or calls again.
 */
export type GptLiveCallState =
    | { readonly kind: "idle" }
    | {
          readonly kind: "connecting";
          readonly connectionId: string;
          /** Replacing an established call after its voice prompt changed. */
          readonly restarting: boolean;
          readonly muted: boolean;
      }
    | {
          readonly kind: "active";
          readonly connectionId: string;
          readonly muted: boolean;
          /** When the call became active, in epoch milliseconds. */
          readonly since: number;
      }
    | {
          readonly kind: "ended";
          readonly connectionId: string;
          readonly problem: GptLiveProblem;
          readonly message: string;
      };

/** What one agent's voice can use, as this window last read it. */
export type GptLiveAvailabilityRead =
    | { readonly status: "checking" }
    | { readonly status: "ready"; readonly availability: GptLiveAvailability }
    | { readonly status: "failed"; readonly message: string };

export interface GptLiveSnapshot {
    readonly gptLiveEnabled: boolean;
    readonly call: GptLiveCallState;
    /** By connection ID; an agent is read only when a surface asks for it. */
    readonly availability: ReadonlyMap<string, GptLiveAvailabilityRead>;
    /** The voice account chosen on each agent, by connection ID. */
    readonly accountIds: ReadonlyMap<string, string>;
    readonly transcripts: readonly GptLiveTranscriptFragment[];
    readonly actionStatus?: string;
    /** The calling agent's prompt revision captured at start, published once active. */
    readonly promptRevision?: number;
    /**
     * What the call is pointing at, separate from the window's own selection.
     * It lasts until the call points elsewhere, the call ends, or
     * `GPT_LIVE_VOICE_FOCUS_MS` passes, whichever comes first.
     */
    readonly voiceFocus?: GptLiveVoiceFocus;
}

/** How long a voice highlight stays up when nothing replaces or clears it. */
export const GPT_LIVE_VOICE_FOCUS_MS = 30_000;

export interface GptLiveStore {
    get(): GptLiveSnapshot;
    subscribe(listener: () => void): () => void;
    /** Opts into the desktop voice surface; never starts a call or a coding task. */
    gptLiveEnabledUpdate(enabled: boolean): void;
    /** Reads one agent's voice capability and accounts, when a surface asks for them. */
    availabilityRead(connectionId: string): void;
    accountSelect(connectionId: string, accountId: string): void;
    /**
     * A deliberate human Start on one agent, which hosts the call; restoring a
     * preference never starts recording. Ignored while another call is live.
     */
    callStart(connectionId: string): void;
    /** Hangs up a live call, or puts away an ended one. */
    callEnd(): void;
    /** Explicitly replaces an established call, after its normal close confirms completion. */
    callRestart(): void;
    microphoneMutedUpdate(muted: boolean): void;
    /** The call's received audio in three bands; zero without an active call. Never notifies. */
    outputLevelsRead(): GptLiveOutputLevels;
    [Symbol.dispose](): void;
}

const IDLE: GptLiveCallState = { kind: "idle" };
const SILENT: GptLiveOutputLevels = [0, 0, 0];
const DISABLED: GptLiveSnapshot = {
    gptLiveEnabled: false,
    call: IDLE,
    availability: new Map(),
    accountIds: new Map(),
    transcripts: [],
};

function problemOf(error: unknown): GptLiveProblem | "cancelled" {
    const code = error instanceof UserError ? error.code : undefined;
    if (code === "cancelled") return "cancelled";
    return GPT_LIVE_PROBLEMS.find((problem) => problem === code) ?? "connection";
}

/**
 * Window-owned opt-in. Construction and subscription open no microphone,
 * transport, controller, timer, or session subscription. Even a persisted true
 * value is a preference, never consent to start recording on the next launch.
 * Each agent's runtime is supplied by the desktop and owns all external resources.
 */
export function gptLiveStoreCreate(
    persistence?: GptLivePersistence,
    runtimes?: GptLiveRuntimes,
    experiments?: Pick<ExperimentsStore, "get">,
    promptRevisionRead: (connectionId: string) => number = () => 0,
): GptLiveStore {
    const allowed = () => experiments?.get().voice ?? true;
    let snapshot = DISABLED;
    try {
        // Local storage is an external, editable boundary. Only literal true
        // opts in; missing, obsolete, malformed, or inaccessible records fail off.
        const document: unknown = persistence?.read();
        if (
            typeof document === "object" &&
            document !== null &&
            typeof (document as { gptLiveEnabled?: unknown }).gptLiveEnabled === "boolean"
        ) {
            const enabled = (document as { gptLiveEnabled: boolean }).gptLiveEnabled && allowed();
            const stored = (document as { accountIds?: unknown }).accountIds;
            const accountIds = new Map<string, string>();
            if (typeof stored === "object" && stored !== null)
                for (const [connectionId, accountId] of Object.entries(stored))
                    if (typeof accountId === "string") accountIds.set(connectionId, accountId);
            snapshot = { ...DISABLED, gptLiveEnabled: enabled, accountIds };
        }
    } catch {
        // Keep the default when storage cannot be read.
    }
    const listeners = new Set<() => void>();
    let disposed = false;
    let generation = 0;
    const availabilityControllers = new Map<string, AbortController>();
    let callController: AbortController | undefined;
    let call: GptLiveCall | undefined;
    let opening: Promise<void> | undefined;
    let activeEpoch: number | undefined;
    let cleanup: Promise<void> = Promise.resolve();
    let cleanupPending = false;
    /** The agent whose Start waits for its availability. */
    let startAfterAvailability: { connectionId: string; restarting: boolean } | undefined;
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const publish = (next: GptLiveSnapshot) => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const persist = (next: GptLiveSnapshot) => {
        try {
            persistence?.write({
                gptLiveEnabled: next.gptLiveEnabled,
                ...(next.accountIds.size > 0
                    ? { accountIds: Object.fromEntries(next.accountIds) }
                    : {}),
            });
        } catch {
            // An unavailable persistence adapter must not prevent disabling.
        }
    };
    const focusTimerClear = () => {
        if (focusTimer !== undefined) clearTimeout(focusTimer);
        focusTimer = undefined;
    };
    const focusUpdate = (focus: GptLiveVoiceFocus | null) => {
        focusTimerClear();
        const { voiceFocus: _previous, ...rest } = snapshot;
        if (!focus) {
            if (snapshot.voiceFocus) publish(rest);
            return;
        }
        publish({ ...rest, voiceFocus: focus });
        focusTimer = setTimeout(() => {
            focusTimer = undefined;
            if (disposed || snapshot.voiceFocus?.id !== focus.id) return;
            const { voiceFocus: _expired, ...remaining } = snapshot;
            publish(remaining);
        }, GPT_LIVE_VOICE_FOCUS_MS);
    };
    const live = () => snapshot.call.kind === "connecting" || snapshot.call.kind === "active";
    const muted = () =>
        snapshot.call.kind === "connecting" || snapshot.call.kind === "active"
            ? snapshot.call.muted
            : false;
    const stop = (): Promise<void> => {
        startAfterAvailability = undefined;
        focusTimerClear();
        generation++;
        const previous = call;
        const previousOpening = opening;
        call = undefined;
        opening = undefined;
        activeEpoch = undefined;
        if (previous || previousOpening) {
            cleanupPending = true;
            cleanup = previous ? Promise.resolve(previous.close()) : previousOpening!;
            // Track confirmed closure for an owned call, or a pending open's
            // late handle cleanup. Aborted uncertain creates retain the runtime's
            // existing background cleanup and do not become restart candidates.
            void cleanup.then(
                () => {
                    cleanupPending = false;
                },
                () => {
                    cleanupPending = false;
                },
            );
        }
        callController?.abort();
        callController = undefined;
        return cleanup;
    };
    /** The call's resting state: nothing, or why it could not go on. */
    const settle = (ended?: { connectionId: string; problem: GptLiveProblem; message: string }) => {
        const { actionStatus: _actionStatus, voiceFocus: _voiceFocus, ...rest } = snapshot;
        publish({
            ...rest,
            call: ended && snapshot.gptLiveEnabled ? { kind: "ended", ...ended } : IDLE,
        });
    };
    const receive = (
        epoch: number,
        connectionId: string,
        promptRevision: number,
        event: GptLiveRuntimeEvent,
    ) => {
        if (disposed || epoch !== generation || !snapshot.gptLiveEnabled) return;
        switch (event.type) {
            case "callActive":
                // Provider readiness can precede the callOpen continuation.
                // Expose an active call only once its close handle is owned.
                if (!call) {
                    activeEpoch = epoch;
                    return;
                }
                publish({
                    ...snapshot,
                    call: { kind: "active", connectionId, muted: muted(), since: Date.now() },
                    promptRevision,
                });
                break;
            case "callClosed":
                stop();
                settle();
                break;
            case "callFailed":
                stop();
                settle({ connectionId, problem: event.problem, message: event.message });
                break;
            case "transcriptReceived": {
                // Stable fragment IDs replace revisions without inventing user-turn boundaries.
                const transcripts = [...snapshot.transcripts];
                const existing = transcripts.findIndex((item) => item.id === event.fragment.id);
                if (existing < 0) transcripts.push(event.fragment);
                else transcripts[existing] = event.fragment;
                publish({ ...snapshot, transcripts: transcripts.slice(-100) });
                break;
            }
            case "actionStatusUpdated":
                publish({ ...snapshot, actionStatus: event.message });
                break;
            case "voiceFocusUpdated":
                // Only a live call points anywhere; a late event from a call
                // that is still connecting or already ending changes nothing.
                if (snapshot.call.kind === "active") focusUpdate(event.focus);
                break;
        }
    };
    /** Opens the call on an agent whose availability has just been read. */
    const open = (connectionId: string, availability: GptLiveAvailability, restarting: boolean) => {
        if (!runtimes) return;
        if (!availability.supported) {
            settle({
                connectionId,
                problem: availability.problem ?? "notSetUp",
                message: availability.reason ?? "Voice is not available on this agent.",
            });
            return;
        }
        const accountId = snapshot.accountIds.get(connectionId);
        const account = availability.accounts.find((item) => item.id === accountId);
        if (!account) {
            settle({
                connectionId,
                problem: "notSetUp",
                message:
                    availability.accounts.length > 0
                        ? "Choose a voice account for this agent in Voice settings."
                        : (availability.reason ??
                          "Configure an enabled Codex subscription or OpenAI API provider on this agent to use voice."),
            });
            return;
        }
        const abort = new AbortController();
        // A normal explicit Start also retains the existing recovery behavior
        // after an earlier close failed. Restart itself must confirm cleanup.
        cleanup = Promise.resolve();
        callController = abort;
        const epoch = ++generation;
        const promptRevision = promptRevisionRead(connectionId);
        const microphoneMuted = muted();
        publish({
            ...snapshot,
            call: {
                kind: "connecting",
                connectionId,
                restarting,
                muted: microphoneMuted,
            },
            transcripts: [],
        });
        const pendingOpen = runtimes(connectionId)
            .callOpen(
                { account, microphoneMuted },
                (event) => receive(epoch, connectionId, promptRevision, event),
                abort.signal,
            )
            .then(
                (opened) => {
                    if (disposed || abort.signal.aborted || epoch !== generation) {
                        return opened.close();
                    }
                    call = opened;
                    opened.microphoneMutedUpdate(muted());
                    if (activeEpoch === epoch)
                        receive(epoch, connectionId, promptRevision, { type: "callActive" });
                },
                (error: unknown) => {
                    if (disposed || abort.signal.aborted || epoch !== generation) return;
                    stop();
                    const problem = problemOf(error);
                    if (problem === "cancelled") settle();
                    else
                        settle({
                            connectionId,
                            problem,
                            message:
                                error instanceof UserError
                                    ? error.message
                                    : "The voice call could not connect.",
                        });
                },
            );
        opening = pendingOpen;
        void pendingOpen.then(
            () => {
                if (opening === pendingOpen) opening = undefined;
            },
            () => {
                if (opening === pendingOpen) opening = undefined;
            },
        );
    };
    /** Starts on an agent, reading its availability first unless it is known to support voice. */
    const start = (connectionId: string, restarting: boolean) => {
        const read = snapshot.availability.get(connectionId);
        if (read?.status === "ready" && read.availability.supported) {
            open(connectionId, read.availability, restarting);
            return;
        }
        startAfterAvailability = { connectionId, restarting };
        publish({
            ...snapshot,
            call: {
                kind: "connecting",
                connectionId,
                restarting,
                muted: muted(),
            },
        });
        store.availabilityRead(connectionId);
    };
    const availabilitySet = (connectionId: string, read: GptLiveAvailabilityRead) => {
        const availability = new Map(snapshot.availability);
        availability.set(connectionId, read);
        publish({ ...snapshot, availability });
    };
    const store: GptLiveStore = {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => {};
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        gptLiveEnabledUpdate(enabled) {
            if (disposed || snapshot.gptLiveEnabled === enabled || (enabled && !allowed())) return;
            stop();
            const next: GptLiveSnapshot = {
                ...DISABLED,
                gptLiveEnabled: enabled,
                availability: snapshot.availability,
                accountIds: snapshot.accountIds,
            };
            persist(next);
            publish(next);
        },
        availabilityRead(connectionId) {
            if (disposed || !allowed() || availabilityControllers.has(connectionId)) return;
            if (!runtimes) {
                availabilitySet(connectionId, {
                    status: "ready",
                    availability: {
                        supported: false,
                        problem: "unsupportedWindow",
                        reason: "This desktop build does not support GPT-Live calls.",
                        accounts: [],
                    },
                });
                return;
            }
            const controller = new AbortController();
            availabilityControllers.set(connectionId, controller);
            availabilitySet(connectionId, { status: "checking" });
            const settled = () => {
                if (availabilityControllers.get(connectionId) === controller)
                    availabilityControllers.delete(connectionId);
            };
            void runtimes(connectionId)
                .availabilityRead(controller.signal)
                .then(
                    (availability) => {
                        settled();
                        if (disposed || controller.signal.aborted) return;
                        availabilitySet(connectionId, { status: "ready", availability });
                        const pending = startAfterAvailability;
                        if (pending?.connectionId !== connectionId) return;
                        startAfterAvailability = undefined;
                        if (snapshot.gptLiveEnabled)
                            open(connectionId, availability, pending.restarting);
                    },
                    () => {
                        settled();
                        if (disposed || controller.signal.aborted) return;
                        const message =
                            "Voice availability could not be checked. Check this agent's connection.";
                        availabilitySet(connectionId, { status: "failed", message });
                        if (startAfterAvailability?.connectionId !== connectionId) return;
                        startAfterAvailability = undefined;
                        settle({ connectionId, problem: "connection", message });
                    },
                );
        },
        accountSelect(connectionId, accountId) {
            const read = snapshot.availability.get(connectionId);
            if (
                disposed ||
                (live() &&
                    snapshot.call.kind !== "idle" &&
                    snapshot.call.connectionId === connectionId) ||
                read?.status !== "ready" ||
                !read.availability.accounts.some((item) => item.id === accountId)
            )
                return;
            const accountIds = new Map(snapshot.accountIds);
            accountIds.set(connectionId, accountId);
            const next = { ...snapshot, accountIds };
            persist(next);
            publish(next);
        },
        callStart(connectionId) {
            if (disposed || !allowed() || !snapshot.gptLiveEnabled || live() || callController)
                return;
            if (!runtimes) {
                settle({
                    connectionId,
                    problem: "unsupportedWindow",
                    message: "This desktop build does not support GPT-Live calls.",
                });
                return;
            }
            if (cleanupPending) {
                // Calling again right after End waits for that call's close
                // to be confirmed, showing the new call connecting meanwhile.
                const epoch = generation;
                publish({
                    ...snapshot,
                    call: {
                        kind: "connecting",
                        connectionId,
                        restarting: false,
                        muted: false,
                    },
                });
                void cleanup
                    .catch(() => undefined)
                    .then(() => {
                        if (disposed || epoch !== generation || !snapshot.gptLiveEnabled) return;
                        start(connectionId, false);
                    });
                return;
            }
            start(connectionId, false);
        },
        callEnd() {
            if (disposed) return;
            stop();
            settle();
        },
        callRestart() {
            // Pending microphone grants/uncertain creates keep their existing
            // cancellation path; only an established active call offers Restart.
            const current = snapshot.call;
            if (disposed || !snapshot.gptLiveEnabled || current.kind !== "active" || !call) return;
            const closing = stop();
            const epoch = generation;
            publish({
                ...snapshot,
                call: {
                    kind: "connecting",
                    connectionId: current.connectionId,
                    restarting: true,
                    muted: current.muted,
                },
            });
            void closing.then(
                () => {
                    if (disposed || epoch !== generation || !snapshot.gptLiveEnabled) return;
                    start(current.connectionId, true);
                },
                (error: unknown) => {
                    if (disposed || epoch !== generation || !snapshot.gptLiveEnabled) return;
                    settle({
                        connectionId: current.connectionId,
                        problem: "connection",
                        message:
                            error instanceof UserError
                                ? error.message
                                : "The previous voice call could not be confirmed closed.",
                    });
                },
            );
        },
        microphoneMutedUpdate(nextMuted) {
            const current = snapshot.call;
            if (disposed || !snapshot.gptLiveEnabled) return;
            if (current.kind !== "connecting" && current.kind !== "active") return;
            call?.microphoneMutedUpdate(nextMuted);
            publish({ ...snapshot, call: { ...current, muted: nextMuted } });
        },
        outputLevelsRead: () =>
            snapshot.call.kind === "active" && call ? call.outputLevelsRead() : SILENT,
        [Symbol.dispose]() {
            if (disposed) return;
            stop();
            for (const controller of availabilityControllers.values()) controller.abort();
            availabilityControllers.clear();
            disposed = true;
            listeners.clear();
        },
    };
    return store;
}

/** Explicit window lifetime: withdrawing experiments ends voice through its normal close path. */
export function gptLiveExperimentsConnect(
    store: GptLiveStore,
    experiments: ExperimentsStore,
): () => void {
    const reconcile = () => {
        if (!experiments.get().voice) store.gptLiveEnabledUpdate(false);
    };
    reconcile();
    return experiments.subscribe(reconcile);
}

export const gptLiveStoreNoop: GptLiveStore = {
    get: () => DISABLED,
    subscribe: () => () => {},
    gptLiveEnabledUpdate: () => {},
    availabilityRead: () => {},
    accountSelect: () => {},
    callStart: () => {},
    callEnd: () => {},
    callRestart: () => {},
    microphoneMutedUpdate: () => {},
    outputLevelsRead: () => SILENT,
    [Symbol.dispose]: () => {},
};
