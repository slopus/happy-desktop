import type {
    GptLiveAccount,
    GptLiveAvailability,
    GptLiveCall,
    GptLiveMessageConfirmation,
    GptLiveRuntime,
    GptLiveRuntimeEvent,
    GptLiveTranscriptFragment,
} from "./gptLiveRuntime.js";
import type { ExperimentsStore } from "../experiments/experimentsStore.js";

/** A desktop preference, independent of any coding session or provider default. */
export interface GptLiveDocument {
    readonly gptLiveEnabled: boolean;
}

export interface GptLivePersistence {
    read(): GptLiveDocument | undefined;
    write(document: GptLiveDocument): void;
}

export interface GptLiveSnapshot {
    readonly gptLiveEnabled: boolean;
    readonly status:
        | "disabled"
        | "idle"
        | "checking"
        | "unavailable"
        | "connecting"
        | "active"
        | "error";
    readonly availability?: GptLiveAvailability;
    readonly accountId?: string;
    readonly microphoneMuted: boolean;
    readonly panelVisible: boolean;
    readonly transcripts: readonly GptLiveTranscriptFragment[];
    readonly confirmation?: GptLiveMessageConfirmation;
    readonly confirmationSending: boolean;
    readonly actionStatus?: string;
    readonly error?: string;
}

export interface GptLiveStore {
    get(): GptLiveSnapshot;
    subscribe(listener: () => void): () => void;
    /** Opts into the desktop voice surface; never starts a call or a coding task. */
    gptLiveEnabledUpdate(enabled: boolean): void;
    /** Reads capability/account choices only when enabled and explicitly requested by the surface. */
    availabilityRead(): void;
    accountSelect(id: string): void;
    /** A deliberate human Start action; restoring a preference never starts recording. */
    callStart(): void;
    callEnd(): void;
    panelOpen(): void;
    panelClose(): void;
    microphoneMutedUpdate(muted: boolean): void;
    messageConfirm(actionId: string): void;
    messageCancel(actionId: string): void;
    [Symbol.dispose](): void;
}

const DISABLED: GptLiveSnapshot = {
    gptLiveEnabled: false,
    status: "disabled",
    microphoneMuted: false,
    panelVisible: false,
    transcripts: [],
    confirmationSending: false,
};

/**
 * Window-owned opt-in. Construction and subscription open no microphone,
 * transport, controller, timer, or session subscription. Even a persisted true
 * value is a preference, never consent to start recording on the next launch.
 * The runtime is supplied by the desktop and owns all external resources.
 */
export function gptLiveStoreCreate(
    persistence?: GptLivePersistence,
    runtime?: GptLiveRuntime,
    experiments?: Pick<ExperimentsStore, "get">,
): GptLiveStore {
    const allowed = () => experiments?.get().experimentalFeaturesEnabled ?? true;
    let snapshot = DISABLED;
    try {
        // Local storage is an external, editable boundary. Only literal true
        // opts in; missing, obsolete, malformed, or inaccessible records fail off.
        const document: unknown = persistence?.read();
        if (
            typeof document === "object" &&
            document !== null &&
            (document as { gptLiveEnabled?: unknown }).gptLiveEnabled === true &&
            allowed()
        ) {
            snapshot = { ...DISABLED, gptLiveEnabled: true, status: "idle" };
        }
    } catch {
        // Keep the default when storage cannot be read.
    }
    const listeners = new Set<() => void>();
    let disposed = false;
    let generation = 0;
    let availabilityController: AbortController | undefined;
    let callController: AbortController | undefined;
    let call: GptLiveCall | undefined;
    const publish = (next: GptLiveSnapshot) => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const stop = () => {
        generation++;
        availabilityController?.abort();
        availabilityController = undefined;
        const previous = call;
        call = undefined;
        previous?.close();
        callController?.abort();
        callController = undefined;
    };
    const idle = (error?: string) => {
        const {
            confirmation: _confirmation,
            actionStatus: _actionStatus,
            error: _error,
            ...rest
        } = snapshot;
        publish({
            ...rest,
            status: snapshot.gptLiveEnabled ? (error ? "error" : "idle") : "disabled",
            microphoneMuted: false,
            confirmationSending: false,
            ...(error ? { error } : {}),
        });
    };
    const receive = (epoch: number, event: GptLiveRuntimeEvent) => {
        if (disposed || epoch !== generation || !snapshot.gptLiveEnabled) return;
        switch (event.type) {
            case "callActive":
                publish({ ...snapshot, status: "active" });
                break;
            case "callClosed":
                stop();
                idle();
                break;
            case "callFailed":
                stop();
                idle(event.message);
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
            case "messageConfirmationRequested":
                if (snapshot.confirmation) return;
                publish({
                    ...snapshot,
                    confirmation: event.request,
                    confirmationSending: false,
                    panelVisible: true,
                });
                break;
            case "messageConfirmationCleared":
                if (snapshot.confirmation?.actionId === event.actionId) {
                    const { confirmation: _confirmation, ...rest } = snapshot;
                    publish({ ...rest, confirmationSending: false });
                }
                break;
            case "actionStatusUpdated":
                publish({ ...snapshot, actionStatus: event.message });
                break;
        }
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
                status: enabled ? "idle" : "disabled",
            };
            try {
                persistence?.write({ gptLiveEnabled: enabled });
            } catch {
                // An unavailable persistence adapter must not prevent disabling.
            }
            publish(next);
        },
        availabilityRead() {
            if (
                disposed ||
                !allowed() ||
                !snapshot.gptLiveEnabled ||
                availabilityController ||
                callController
            )
                return;
            if (!runtime) {
                publish({
                    ...snapshot,
                    status: "unavailable",
                    error: "This desktop build does not support GPT-Live calls.",
                });
                return;
            }
            const controller = new AbortController();
            availabilityController = controller;
            const epoch = generation;
            publish({ ...snapshot, status: "checking", error: undefined });
            void runtime.availabilityRead(controller.signal).then(
                (availability) => {
                    if (disposed || controller.signal.aborted || generation !== epoch) return;
                    availabilityController = undefined;
                    publish({
                        ...snapshot,
                        availability,
                        status: availability.supported ? "idle" : "unavailable",
                        error: availability.reason,
                        accountId: availability.accounts.some(
                            (item) => item.id === snapshot.accountId,
                        )
                            ? snapshot.accountId
                            : undefined,
                    });
                },
                () => {
                    if (disposed || controller.signal.aborted || generation !== epoch) return;
                    availabilityController = undefined;
                    publish({
                        ...snapshot,
                        status: "unavailable",
                        error: "GPT-Live availability could not be checked. Check your Happy Agent connection.",
                    });
                },
            );
        },
        accountSelect(id) {
            if (
                disposed ||
                !snapshot.gptLiveEnabled ||
                callController ||
                !snapshot.availability?.accounts.some((item) => item.id === id)
            )
                return;
            publish({ ...snapshot, accountId: id });
        },
        callStart() {
            if (
                disposed ||
                !allowed() ||
                !snapshot.gptLiveEnabled ||
                !runtime ||
                callController ||
                availabilityController ||
                !snapshot.availability?.supported
            )
                return;
            const account: GptLiveAccount | undefined = snapshot.availability.accounts.find(
                (item) => item.id === snapshot.accountId,
            );
            if (!account) {
                publish({ ...snapshot, error: "Choose a voice account before starting." });
                return;
            }
            const abort = new AbortController();
            callController = abort;
            const epoch = ++generation;
            publish({
                ...snapshot,
                status: "connecting",
                transcripts: [],
                error: undefined,
                microphoneMuted: false,
            });
            void runtime
                .callOpen({ account }, (event) => receive(epoch, event), abort.signal)
                .then(
                    (opened) => {
                        if (disposed || abort.signal.aborted || epoch !== generation) {
                            opened.close();
                            return;
                        }
                        call = opened;
                        opened.microphoneMutedUpdate(snapshot.microphoneMuted);
                    },
                    () => {
                        if (disposed || abort.signal.aborted || epoch !== generation) return;
                        stop();
                        idle(
                            "GPT-Live could not connect. Check microphone permission and your selected account's Live access.",
                        );
                    },
                );
        },
        callEnd() {
            if (disposed) return;
            stop();
            idle();
        },
        panelOpen() {
            if (disposed || !allowed() || !snapshot.gptLiveEnabled) return;
            publish({ ...snapshot, panelVisible: true });
            if (!snapshot.availability) store.availabilityRead();
        },
        panelClose() {
            if (disposed || !snapshot.panelVisible) return;
            publish({ ...snapshot, panelVisible: false });
        },
        microphoneMutedUpdate(muted) {
            if (disposed || !callController || !snapshot.gptLiveEnabled) return;
            call?.microphoneMutedUpdate(muted);
            publish({ ...snapshot, microphoneMuted: muted });
        },
        messageConfirm(actionId) {
            if (
                disposed ||
                !call ||
                snapshot.status !== "active" ||
                snapshot.confirmation?.actionId !== actionId ||
                snapshot.confirmationSending
            )
                return;
            const epoch = generation;
            publish({ ...snapshot, confirmationSending: true });
            void call.messageConfirm(actionId).catch(() => {
                if (
                    disposed ||
                    epoch !== generation ||
                    snapshot.confirmation?.actionId !== actionId
                )
                    return;
                publish({
                    ...snapshot,
                    confirmationSending: false,
                    error: "The message could not be sent. Your draft has not been discarded.",
                });
            });
        },
        messageCancel(actionId) {
            if (
                disposed ||
                snapshot.confirmation?.actionId !== actionId ||
                snapshot.confirmationSending
            )
                return;
            call?.messageCancel(actionId);
            const { confirmation: _confirmation, ...rest } = snapshot;
            publish({ ...rest, confirmationSending: false });
        },
        [Symbol.dispose]() {
            if (disposed) return;
            stop();
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
        if (!experiments.get().experimentalFeaturesEnabled) store.gptLiveEnabledUpdate(false);
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
    panelOpen: () => {},
    panelClose: () => {},
    microphoneMutedUpdate: () => {},
    messageConfirm: () => {},
    messageCancel: () => {},
    [Symbol.dispose]: () => {},
};
