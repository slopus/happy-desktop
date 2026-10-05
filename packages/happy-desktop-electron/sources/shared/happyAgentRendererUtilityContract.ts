import type { Cuid2 } from "@slopus/happy-agent-client";

/** Private ownership metadata; no provider payload or credential is remembered here. */
export interface RendererLiveAttempt {
    readonly id: Cuid2;
    readonly windowId: string;
    readonly connectionId?: string;
}

/** Private main <-> utility-process protocol. Neither side sends this to Chromium. */
export type RendererUtilityInput =
    | {
          readonly type: "backing";
          readonly id: number;
          readonly bridgeUrl: string;
          readonly terminalCapability: string;
          readonly transport: { readonly socketPath: string; readonly token: string };
          readonly allowedOrigin?: string;
      }
    | { readonly type: "detach"; readonly id: number }
    | { readonly type: "live-window-start"; readonly windowId: string }
    | { readonly type: "live-window-close"; readonly windowId: string }
    | {
          readonly type: "live-attempt-reserved";
          readonly reservationId: number;
          readonly allowed: boolean;
      }
    | {
          readonly type: "live-attempt-restore";
          readonly attempt: RendererLiveAttempt;
          readonly disposed: boolean;
      };

export type RendererUtilityOutput =
    | {
          readonly type: "ready";
          readonly port: number;
          readonly username: string;
          readonly password: string;
      }
    | { readonly type: "attached"; readonly id: number }
    | { readonly type: "unavailable"; readonly id: number }
    | {
          readonly type: "live-attempt-reserve";
          readonly reservationId: number;
          readonly backingId: number;
          readonly attempt: RendererLiveAttempt;
      }
    | { readonly type: "debug"; readonly text: string };
