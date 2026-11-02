import { formatHappyServerLink } from "@slopus/happy-agent-client";

/** What a phone needs to add a team server: the installation it is, and where it answers. */
export interface ServerPhoneLinkServer {
    /** The server's own health `instanceId`. */
    readonly instanceId?: string;
    /** Its address, as the host Happy Agent normalized it. */
    readonly url?: string;
}

/**
 * The code a phone scans to add a team server, written by the client's
 * server-link grammar: `happy://<instanceId>/server?url=<url>`, where `url` is
 * the server's address exactly as the host Happy Agent normalized it. It names
 * the server and holds no token: the phone signs in on its own and keeps the
 * server only if its health reports the same instance. A server whose
 * instance is not known yet, or that is not reached over HTTPS, has none.
 */
export function serverPhoneLinkFormat(server: ServerPhoneLinkServer): string | undefined {
    const { instanceId, url } = server;
    if (instanceId === undefined || url === undefined) return undefined;
    try {
        return formatHappyServerLink({ instanceId, url });
    } catch {
        // Loopback http, an address not in normalized form, or a link too long.
        return undefined;
    }
}
