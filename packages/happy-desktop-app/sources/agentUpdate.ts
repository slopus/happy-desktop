import type { SidebarUpdateNotes } from "happy-desktop-ui";
import type {
    AppHappyAgentDaemonRestartStep,
    AppHappyAgentDrainComponent,
} from "./views/AppHappyAgentSettingsView";

/**
 * Where an update of this machine's Happy Agent has got to, as the window tells
 * it. The running steps are the daemon's own report; `done` is the window's,
 * held until it is talking to the new daemon again.
 */
export type AppHappyAgentUpdateProgress =
    | {
          readonly kind: "draining";
          readonly waitingFor: readonly AppHappyAgentDrainComponent[];
          /** The most open work the drain has held at once. */
          readonly waitingPeak: number;
          /**
           * Whether the drain can be cut short from the card. `pending` once
           * the window has asked, until the daemon reports it stopping;
           * `unavailable` for a restart this window did not start and cannot
           * stop, such as `happy-agent reload` run from a terminal.
           */
          readonly restartNow: "available" | "pending" | "unavailable";
          /** When the whole restart began (epoch ms), when the host said. */
          readonly startedAt?: number;
      }
    | { readonly kind: "stopping"; readonly killed: boolean; readonly startedAt?: number }
    | { readonly kind: "starting"; readonly startedAt?: number }
    | { readonly kind: "reconnecting"; readonly startedAt?: number }
    | {
          readonly kind: "done";
          /** Present only when the update's start is known. */
          readonly tookMs?: number;
          readonly reason: AppHappyAgentUpdateReason;
      }
    | {
          readonly kind: "failed";
          readonly version: string;
          readonly message: string;
          readonly failedAt: AppHappyAgentDaemonRestartStep;
          readonly reason: AppHappyAgentUpdateReason;
          /** Whether this Happy can run it again: it manages the agent it would restart. */
          readonly retryable: boolean;
      };

/**
 * What the update was, as its closing words say it: onto another version, or
 * back on the same one (a restart from Settings, or `happy-agent reload`).
 */
export type AppHappyAgentUpdateReason = "update" | "restart";

export interface AppHappyAgentUpdateSnapshot {
    readonly progress: AppHappyAgentUpdateProgress;
    /** Whether the card is open above the footer. */
    readonly expanded: boolean;
    /**
     * Whether the update is shown yet. It is mounted, hidden, from its first
     * report so its scene is loaded, and shown once there is something real
     * to say, so it never appears half-built.
     */
    readonly revealed: boolean;
    /**
     * Whether a failure can be handed to the Chief of Staff right now. It is
     * `unavailable` while the local Happy Agent is not serving, has no Chief of
     * Staff, or refused the handoff.
     */
    readonly chiefOfStaff: "available" | "pending" | "unavailable";
    /** The Chief of Staff bot's live name, while the local Happy Agent lists one. */
    readonly chiefOfStaffName?: string;
}

/** The update card's store, supplied only by the native desktop shell. */
export interface AppHappyAgentUpdateStore {
    /** The update under way or just finished, or nothing. */
    get(): AppHappyAgentUpdateSnapshot | undefined;
    subscribe(listener: () => void): () => void;
    /** Folds or opens the card while the update runs; clears a finished or failed one. */
    cardToggle(): void;
    /** Runs a failed update again. */
    updateRetry(): void;
    /**
     * Stops waiting for the drain and restarts at once. Work the daemon had not
     * finished is interrupted: a running non-durable tool, such as a shell
     * command or a file edit, is recorded as interrupted and not run again.
     */
    restartNow(): void;
    /** Writes the failure into the Chief of Staff's draft and opens it. */
    chiefOfStaffAsk(): void;
}

/**
 * What is new in the Happy Agent version the daemon is offering, supplied only
 * by the native desktop shell. It reads every release in range before it says
 * anything, so the notes arrive whole.
 */
export interface AppHappyAgentReleaseNotesStore {
    /** Notes for the offered version, or nothing while none are known. */
    get(): SidebarUpdateNotes | undefined;
    subscribe(listener: () => void): () => void;
}
