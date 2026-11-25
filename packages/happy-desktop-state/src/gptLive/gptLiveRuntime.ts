import type { GptLiveNavigationTarget } from "./gptLiveDesktopSource.js";

/** Product choices, never provider credentials or transport addresses. */
export interface GptLiveAccount {
    readonly id: string;
    readonly label: string;
    readonly providerId: string;
    readonly kind: "subscription" | "api";
}

/**
 * Why a call on one agent cannot start or stopped, in the person's terms.
 * `connection` covers every failure the agent reports without a typed reason.
 */
export type GptLiveProblem =
    /** The agent's connection is not connected. */
    | "agentOffline"
    /** The agent offers no desktop voice, or no enabled voice account. */
    | "notSetUp"
    /** This window cannot place calls: not the native voice-enabled window. */
    | "unsupportedWindow"
    | "microphonePermission"
    /** It started and then dropped, timed out, or never connected. */
    | "connection";

export const GPT_LIVE_PROBLEMS: readonly GptLiveProblem[] = [
    "agentOffline",
    "notSetUp",
    "unsupportedWindow",
    "microphonePermission",
    "connection",
];

export interface GptLiveAvailability {
    readonly supported: boolean;
    readonly reason?: string;
    /** Present whenever `supported` is false. */
    readonly problem?: GptLiveProblem;
    readonly accounts: readonly GptLiveAccount[];
}

/** Where an opening call is, for its own progress and for nothing else. */
export type GptLiveCallStep = "checking" | "microphone" | "allocating" | "attaching";

export interface GptLiveTranscriptFragment {
    readonly id: string;
    readonly role: "user" | "assistant";
    readonly text: string;
    readonly startMs?: number;
    readonly endMs?: number;
}

/**
 * What a voice call is pointing at, apart from what the window has selected.
 * `mention` marks something the call is talking about; `navigation` marks the
 * target of a navigation that is about to happen, which the window may reveal
 * inside folded rows for as long as it lasts.
 */
export interface GptLiveVoiceFocus {
    readonly id: string;
    readonly target: GptLiveNavigationTarget;
    readonly reason: "mention" | "navigation";
}

/** Events are already validated and projected by the owning call integration. */
export type GptLiveRuntimeEvent =
    | { readonly type: "callActive" }
    | { readonly type: "callClosed" }
    | {
          readonly type: "callFailed";
          readonly message: string;
          readonly problem: GptLiveProblem;
      }
    | { readonly type: "callStepUpdated"; readonly step: GptLiveCallStep }
    | { readonly type: "transcriptReceived"; readonly fragment: GptLiveTranscriptFragment }
    | { readonly type: "actionStatusUpdated"; readonly message: string }
    /** `null` clears whatever the call was pointing at. */
    | { readonly type: "voiceFocusUpdated"; readonly focus: GptLiveVoiceFocus | null };

/** The agent's received audio as three bands (low, mid, high), each 0..1, raw; the UI smooths. */
export type GptLiveOutputLevels = readonly [low: number, mid: number, high: number];

export interface GptLiveCall {
    /** Stops recording/actions synchronously; resolves after confirmed closure and transport cleanup. Never aborts tasks. */
    close(): Promise<void>;
    microphoneMutedUpdate(muted: boolean): void;
    /** Read on demand, never pushed: zero before the agent's audio arrives. */
    outputLevelsRead(): GptLiveOutputLevels;
}

/**
 * One agent's already-authenticated desktop integration: that agent hosts the
 * call, with its own voice settings and accounts. It must allocate nothing until
 * called. A rejected open's `UserError.code` is a `GptLiveProblem`, or
 * `cancelled` when the person or its signal ended it. Opening owns microphone, WebRTC, control socket and context/watch
 * subscriptions under the supplied signal; rejection releases all of them.
 * An aborted open must never leave a late microphone grant or remote call alive.
 */
export interface GptLiveRuntime {
    availabilityRead(signal: AbortSignal): Promise<GptLiveAvailability>;
    callOpen(
        input: { readonly account: GptLiveAccount; readonly microphoneMuted?: boolean },
        receive: (event: GptLiveRuntimeEvent) => void,
        signal: AbortSignal,
    ): Promise<GptLiveCall>;
}

/** The window's agents: each connection's own runtime, by connection ID. */
export type GptLiveRuntimes = (connectionId: string) => GptLiveRuntime;
