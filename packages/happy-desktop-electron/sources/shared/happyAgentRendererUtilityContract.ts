import type { Cuid2 } from "@slopus/happy-agent-client";
import type { ServerRemoteCredential } from "./serverRemoteAuthorization.js";

/** Private ownership metadata; no provider payload or credential is remembered here. */
export interface RendererLiveAttempt {
    readonly id: Cuid2;
    readonly windowId: string;
    readonly connectionId?: string;
}

/**
 * Launch argument naming the cross-origin renderer the utility lets in before
 * any daemon backs it, followed directly by that origin.
 */
export const rendererUtilityOriginArgument = "--happy-agent-renderer-origin=";

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
      }
    /**
     * Every team server's current access token with the address it is bound
     * to, by connection ID, replacing the last set. Refresh tokens stay in
     * main and are never sent here.
     */
    | {
          readonly type: "remote-tokens";
          readonly tokens: Readonly<Record<string, ServerRemoteCredential>>;
      }
    /** Main's answer to one `remote-refresh`: the credential to retry with, if any. */
    | {
          readonly type: "remote-refreshed";
          readonly requestId: number;
          readonly credential?: ServerRemoteCredential;
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
    /**
     * A team server refused `rejected` through the daemon: main refreshes the
     * sign-in once and answers with `remote-refreshed`.
     */
    | {
          readonly type: "remote-refresh";
          readonly requestId: number;
          readonly connectionId: string;
          readonly rejected?: string;
      }
    /** The server refused `rejected` again after a refresh: the person must sign in. */
    | {
          readonly type: "remote-sign-in-required";
          readonly connectionId: string;
          readonly rejected: string;
      }
    /** The roster no longer names `serverUrl` for the connection: its sign-in ends. */
    | {
          readonly type: "remote-server-moved";
          readonly connectionId: string;
          readonly serverUrl: string;
      }
    | { readonly type: "debug"; readonly text: string };
