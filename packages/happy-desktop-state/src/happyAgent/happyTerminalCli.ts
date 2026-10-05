/** Status of the operating-system user's existing Happy terminal CLI login. */
export type HappyTerminalCliSnapshot =
    | { readonly status: "loading" }
    | { readonly status: "not-installed" }
    | { readonly status: "unavailable"; readonly message: string; readonly cliVersion?: string }
    | {
          readonly status: "available";
          readonly cliVersion: string;
          readonly auth: "missing" | "v2" | "legacy" | "invalid";
          readonly accountKeyFingerprint?: string;
          readonly serverUrl: string;
          readonly machineId?: string;
          readonly daemon: {
              readonly state:
                  | "stopped"
                  | "online"
                  | "offline"
                  | "unavailable"
                  | "identity-mismatch"
                  | "version-mismatch";
              readonly connection?: {
                  readonly machineId: string;
                  readonly cliVersion: string;
                  readonly serverUrl: string;
                  readonly connected: boolean;
              };
          };
          readonly resetPreview: HappyTerminalCliResetPreview;
      };

/** Exact CLI-owned scope, shown before any local or remote removal. */
export interface HappyTerminalCliResetPreview {
    readonly credentialFile: string;
    readonly settingsFile: string;
    readonly settingsFields: readonly ["machineId", "machineIdConfirmedByServer"];
    readonly registration?: {
        readonly machineId: string;
        readonly serverUrl: string;
        readonly accountKeyFingerprint: string;
    };
    readonly stopsDaemon: true;
}

/** Native input only: the guard never enters the rendered product snapshot. */
export interface HappyTerminalCliInspection {
    readonly snapshot: HappyTerminalCliSnapshot;
    readonly identityGuard?: string;
}

export interface HappyTerminalCliResetRequest {
    readonly expectedGuard: string;
    readonly confirmed: true;
    readonly removeRegistration: boolean;
}

export type HappyTerminalCliResetErrorCode =
    | "credential_missing"
    | "credential_invalid"
    | "account_mismatch"
    | "server_mismatch"
    | "identity_changed"
    | "daemon_unavailable"
    | "daemon_not_ready"
    | "unsupported"
    | "read_failed"
    | "reset_failed"
    | "machine_delete_failed"
    | "invalid_request"
    | "auth_busy";

export interface HappyTerminalCliResetEffects {
    readonly localAuthCleared: boolean;
    readonly registrationRemoved: boolean;
    readonly daemonStopped: boolean;
}

export type HappyTerminalCliResetOutcome = HappyTerminalCliResetEffects &
    (
        | { readonly status: "succeeded" }
        | {
              readonly status: "failed";
              readonly code: HappyTerminalCliResetErrorCode;
              readonly message: string;
          }
    );

/** One concrete confirmation retains the scope that the person actually saw. */
export type HappyMobileManagementConfirmation =
    | { readonly kind: "disconnect"; readonly pending: boolean; readonly error?: string }
    | {
          readonly kind: "terminal-reset";
          readonly preview: HappyTerminalCliResetPreview;
          readonly accountKeyFingerprint?: string;
          readonly removeRegistration: boolean;
          readonly pending: boolean;
          readonly error?: string;
          readonly effects?: HappyTerminalCliResetEffects;
      };
