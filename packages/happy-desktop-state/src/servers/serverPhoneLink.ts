/** What a phone needs to add a team server: the installation it is, and where it answers. */
export interface ServerPhoneLinkServer {
    /** The server's own health `instanceId`. */
    readonly instanceId?: string;
    /** Its address, as the host Happy Agent normalized it. */
    readonly url?: string;
}

/** The longest link the API allows, in characters. */
const SERVER_LINK_MAX = 4096;

/**
 * The code a phone scans to add a team server, by the API's server-link
 * grammar: `happy://<instanceId>/server?url=<encodeURIComponent(url)>`, where
 * `url` is the server's address exactly as the host Happy Agent normalized it,
 * path prefix and trailing `/` included. It names the server and holds no
 * token: the phone signs in on its own and keeps the server only if its health
 * reports the same instance. Only a server reached over HTTPS whose instance
 * is known has one.
 *
 * Stand-in until the client's `formatHappyServerLink`, which is proposed for
 * 0.0.141; this is the one place the link is written.
 */
export function serverPhoneLinkFormat(server: ServerPhoneLinkServer): string | undefined {
    const { instanceId, url } = server;
    if (instanceId === undefined || url === undefined || !serverUrlNormalized(url))
        return undefined;
    const link = `happy://${instanceId}/server?url=${encodeURIComponent(url)}`;
    return link.length <= SERVER_LINK_MAX ? link : undefined;
}

/** HTTPS, already in canonical form, with no credentials, query, or fragment, ending in `/`. */
function serverUrlNormalized(url: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    return (
        parsed.href === url &&
        parsed.protocol === "https:" &&
        parsed.username === "" &&
        parsed.password === "" &&
        parsed.search === "" &&
        parsed.hash === "" &&
        parsed.pathname.endsWith("/")
    );
}
