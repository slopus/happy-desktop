import { HappyAgentApiError, type AuthenticationResponse } from "@slopus/happy-agent-client";

/** One sign-in's progress, reported by the source as it happens. */
export interface ServerSignInProgress {
    /**
     * The system browser is open at the server's authorization page. `host` is
     * that page's host, shown so the person knows where they are signing in.
     */
    signInOpened(host: string): void;
}

/**
 * Where team servers are added and signed in to.
 *
 * The window does not decide who holds the credential. The host Happy Agent can
 * own the connection, run discovery and PKCE, and keep the refresh token, or
 * the desktop shell can. Either one implements this. Every promise rejects with
 * a displayable `UserError`, and aborting the signal cancels the sign-in
 * wherever it has got to.
 */
export interface ServerSource {
    /**
     * Adds the server at `url`, an address `serverUrlParse` accepted, and signs
     * in to it through the system browser. Settles once the server is added and
     * signed in.
     */
    serverAdd(
        url: string,
        progress: ServerSignInProgress,
        signal: AbortSignal,
    ): Promise<{ readonly connectionId: string }>;
    /** Signs in again to a server that was already added, by its connection ID. */
    serverSignIn(
        connectionId: string,
        progress: ServerSignInProgress,
        signal: AbortSignal,
    ): Promise<void>;
}

/**
 * What a failed request says about the person's sign-in, by the edge-SSO
 * contract.
 *
 * - `signInRequired`: the request never reached Happy, or Happy's sign-in is
 *   gone. That is any redirect other than `304 Not Modified`, or a `401` or
 *   `403` that is not Happy's own JSON: a load balancer enforcing SSO answers
 *   with its own page.
 * - `authenticationCheck`: Happy itself answered `401`. That can be an expired
 *   sign-in or a member who has not finished onboarding, which the daemon
 *   reports the same way, so `GET /v0/authentication` with the same bearer
 *   decides; see `serverAuthenticationOutcome`.
 * - `signInRequired` also: the host Happy Agent's `403 remote_sign_in_required`,
 *   its word for a remote server whose sign-in it holds having ended.
 * - `undefined`: the failure is not about signing in.
 *
 * Happy's JSON carries a string `code`, which the client reads into
 * `HappyAgentApiError.code`; an edge's page has none.
 */
export type ServerAuthFailure = "signInRequired" | "authenticationCheck";

export function serverAuthFailure(error: unknown): ServerAuthFailure | undefined {
    for (let current = error; current instanceof Error; current = current.cause) {
        if (!(current instanceof HappyAgentApiError)) continue;
        const happyJson = current.code !== null;
        // 304 answers a conditional read; it is not a redirect.
        if (current.status >= 300 && current.status < 400 && current.status !== 304)
            return "signInRequired";
        if (current.status === 401) return happyJson ? "authenticationCheck" : "signInRequired";
        // The host Happy Agent's proxy says a remote's sign-in ended in Happy's
        // own JSON, so the window never takes it for its own daemon's.
        if (current.status === 403 && current.code === "remote_sign_in_required")
            return "signInRequired";
        if (current.status === 403 && !happyJson) return "signInRequired";
        return undefined;
    }
    return undefined;
}

/** What `GET /v0/authentication` says after Happy answered `401`. */
export type ServerAuthenticationOutcome =
    /** Signed in, with no member profile yet: onboarding, not a new sign-in. */
    | "onboarding"
    /** Signed in as a member: the refusal was transient, so ask once more. */
    | "retry"
    /** The bearer no longer signs anyone in: refresh, then sign in again. */
    | "signInRequired";

export function serverAuthenticationOutcome(
    response: Pick<AuthenticationResponse, "authenticated" | "userId">,
): ServerAuthenticationOutcome {
    if (!response.authenticated) return "signInRequired";
    return response.userId === null ? "onboarding" : "retry";
}
