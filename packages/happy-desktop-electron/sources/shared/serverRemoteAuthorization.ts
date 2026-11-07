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
     * - `restoring`: a sign-in kept from an earlier run is being refreshed;
     *   it becomes one of the other two.
     */
    readonly state: "signedIn" | "signedOut" | "restoring";
    readonly message?: string;
}

/**
 * A team server's access token and the address it was issued for. A token is
 * bound to that address when it is issued and is sent only while the host
 * Happy Agent's roster still names the same address for its connection.
 */
export interface ServerRemoteCredential {
    readonly accessToken: string;
    /** The server's address, normalized by `serverUrlNormalize`. */
    readonly serverUrl: string;
}

/**
 * One spelling for a server address, so a bound address and the roster's can
 * be compared exactly; `undefined` for anything that is not an http(s) URL.
 */
export function serverUrlNormalize(url: string): string | undefined {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return undefined;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    if (parsed.username !== "" || parsed.password !== "") return undefined;
    parsed.hash = "";
    parsed.search = "";
    return parsed.href;
}
