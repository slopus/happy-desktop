/** Product choices, never provider credentials or transport addresses. */
export interface GptLiveAccount {
    readonly id: string;
    readonly label: string;
    readonly providerId: string;
    readonly kind: "subscription" | "api";
}

export interface GptLiveAvailability {
    readonly supported: boolean;
    readonly reason?: string;
    readonly accounts: readonly GptLiveAccount[];
}

export interface GptLiveTranscriptFragment {
    readonly id: string;
    readonly role: "user" | "assistant";
    readonly text: string;
    readonly startMs?: number;
    readonly endMs?: number;
}

export interface GptLiveMessageConfirmation {
    readonly actionId: string;
    readonly targetLabel: string;
    readonly connectionLabel: string;
    readonly modeLabel: string;
    readonly text: string;
}

/** Events are already validated and projected by the owning call integration. */
export type GptLiveRuntimeEvent =
    | { readonly type: "callActive" }
    | { readonly type: "callClosed" }
    | { readonly type: "callFailed"; readonly message: string }
    | { readonly type: "transcriptReceived"; readonly fragment: GptLiveTranscriptFragment }
    | {
          readonly type: "messageConfirmationRequested";
          readonly request: GptLiveMessageConfirmation;
      }
    | { readonly type: "messageConfirmationCleared"; readonly actionId: string }
    | { readonly type: "actionStatusUpdated"; readonly message: string };

export interface GptLiveCall {
    /** Stops recording/actions synchronously; bounded transport finalization may finish asynchronously. Never aborts tasks. */
    close(): void;
    microphoneMutedUpdate(muted: boolean): void;
    /** Invoked only by an explicit exact-text human confirmation in the voice UI. */
    messageConfirm(actionId: string): Promise<void>;
    messageCancel(actionId: string): void;
}

/**
 * An already-authenticated desktop integration. It must allocate nothing until
 * called. Opening owns microphone, WebRTC, control socket and context/watch
 * subscriptions under the supplied signal; rejection releases all of them.
 * An aborted open must never leave a late microphone grant or remote call alive.
 */
export interface GptLiveRuntime {
    availabilityRead(signal: AbortSignal): Promise<GptLiveAvailability>;
    callOpen(
        input: { readonly account: GptLiveAccount },
        receive: (event: GptLiveRuntimeEvent) => void,
        signal: AbortSignal,
    ): Promise<GptLiveCall>;
}
