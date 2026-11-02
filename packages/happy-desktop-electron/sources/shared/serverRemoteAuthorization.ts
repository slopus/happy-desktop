/**
 * The header that carries a team server's access token through the host Happy
 * Agent to that server. The daemon holds no team-server tokens: it moves this
 * header into the server's own `Authorization` and never stores it. A token
 * only ever travels in this header, never in a URL, cookie or subprotocol.
 */
export const SERVER_REMOTE_AUTHORIZATION_HEADER = "happy-remote-authorization";

const REMOTE_PATH = /^\/v0\/connections\/([a-z][a-z0-9_-]{0,63})\/api(?:[/?]|$)/u;

/**
 * The connection a daemon path reaches a team server through, or `undefined`
 * for any other path. Only `/v0/connections/<id>/api/*` is forwarded to a
 * server, so only those requests carry its token.
 */
export function serverRemoteConnectionOf(path: string): string | undefined {
    return REMOTE_PATH.exec(path)?.[1];
}

/** Main's word for a team server's sign-in, as the window sees it. Never a token. */
export interface ServerSessionSnapshot {
    readonly connectionId: string;
    /**
     * - `signedIn`: main holds an access token for the server.
     * - `signedOut`: it holds none, because nobody signed in since the app
     *   started or because a refresh was rejected; `message` says which.
     */
    readonly state: "signedIn" | "signedOut";
    readonly message?: string;
}
