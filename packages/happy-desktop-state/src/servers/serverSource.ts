import { HappyAgentApiError } from "@slopus/happy-agent-client";

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
 * Whether a failed request means the person has to sign in again.
 *
 * The rule is the edge-SSO contract's: any `401`, any redirect, or a `403` that
 * is not Happy's own JSON. A load balancer that enforces SSO answers with its
 * own redirect or page, and a `403` from Happy itself is an authorization
 * refusal that a new sign-in would not change. Happy's JSON carries a string
 * `code`, which the client reads into `HappyAgentApiError.code`.
 */
export function serverSignInRequired(error: unknown): boolean {
    for (let current = error; current instanceof Error; current = current.cause) {
        if (!(current instanceof HappyAgentApiError)) continue;
        if (current.status === 401) return true;
        if (current.status >= 300 && current.status < 400) return true;
        return current.status === 403 && current.code === null;
    }
    return false;
}
