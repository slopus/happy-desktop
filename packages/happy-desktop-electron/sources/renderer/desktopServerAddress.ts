/** A typed server address, as the host Happy Agent would spell it, or why it can't be one. */
export type DesktopServerAddress =
    | { readonly ok: true; readonly url: string; readonly host: string }
    | { readonly ok: false; readonly message: string };

/** Hosts a server may be reached over plain `http` at, for local testing. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Reads a server address as the person typed it. One without a scheme is an
 * `https` address. The result is normalized the way the host Happy Agent
 * normalizes a server connection's URL: scheme and host lowercased, a default
 * port dropped, the path ending in `/`. So it compares exactly with a
 * roster entry's `url`.
 */
export function desktopServerAddressRead(input: string): DesktopServerAddress {
    const typed = input.trim();
    const absolute = /^[a-z][a-z0-9+.-]*:\/\//iu.test(typed) ? typed : `https://${typed}`;
    let url: URL;
    try {
        url = new URL(absolute);
    } catch {
        return {
            ok: false,
            message: "That isn’t a web address. Enter one like https://happy.example.com.",
        };
    }
    if (
        url.protocol !== "https:" &&
        !(url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname))
    )
        return { ok: false, message: "Happy connects to servers over https only." };
    if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "")
        return {
            ok: false,
            message: "Enter only the server’s address, without a query, a # or sign-in details.",
        };
    if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
    return { ok: true, url: url.href, host: url.host };
}

/** What adding a server by its address came to. */
export type DesktopServerAddResult =
    | {
          readonly ok: true;
          /** The host's connection ID for the server. */
          readonly connectionId: string;
          /** What the server is listed as. */
          readonly name: string;
          /** Whether this call added it, rather than finding it already listed. */
          readonly added: boolean;
      }
    | { readonly ok: false; readonly message: string };

/**
 * Why the host Happy Agent refused to add a server, for the person. Happy's
 * own sentence stands where it is about the address; the rest are said here
 * by status and code.
 */
export function desktopServerAddRefusal(status: number, body: unknown, host: string): string {
    const error =
        typeof body === "object" && body !== null && "error" in body ? body.error : undefined;
    const code =
        typeof body === "object" && body !== null && "code" in body ? body.code : undefined;
    const said = typeof error === "string" && error !== "" ? error : undefined;
    if (code === "remote_unavailable")
        return `Happy couldn’t reach ${host}. Check the address and your network.`;
    if (code === "remote_timeout") return `${host} didn’t answer in time. Try again.`;
    if (code === "unsupported" || status === 501)
        return "This computer’s Happy Agent is a team server, so it can’t connect to other servers by address.";
    if (status === 404)
        return "Update the Happy Agent on this computer to connect to a server by its address.";
    if (status === 403) return said ?? "Only this computer’s owner can connect it to a server.";
    return said ?? "Happy couldn’t add this server. Try again.";
}

/**
 * The server `POST /v0/connections/servers` added at `url`, read from the
 * roster it answered with: its connection ID and the name it is listed as.
 */
export function desktopServerAddedRead(
    body: unknown,
    url: string,
): { readonly connectionId: string; readonly name: string } | undefined {
    const connections =
        typeof body === "object" && body !== null && "connections" in body
            ? body.connections
            : undefined;
    if (!Array.isArray(connections)) return undefined;
    for (const connection of connections as unknown[]) {
        if (typeof connection !== "object" || connection === null) continue;
        const { authentication, id, name, url: listed } = connection as Record<string, unknown>;
        if (
            authentication === "oauth" &&
            listed === url &&
            typeof id === "string" &&
            typeof name === "string"
        )
            return { connectionId: id, name };
    }
    return undefined;
}
