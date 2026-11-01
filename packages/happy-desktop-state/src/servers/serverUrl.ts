/** Why typed text is not a server address Happy will add. */
export type ServerUrlProblem =
    | "empty"
    | "invalid"
    /** Plain HTTP to anything but this computer. */
    | "insecure"
    /** A user name or password inside the address. */
    | "credentials"
    /** A query or fragment, which no server base address has. */
    | "extra";

export type ServerUrlParse =
    | { readonly ok: true; readonly url: string }
    | { readonly ok: false; readonly problem: ServerUrlProblem };

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Reads the address a person typed for a team server.
 *
 * A server is reached over HTTPS. Plain HTTP is accepted only for this computer,
 * where a development server has no certificate and nothing crosses a network.
 * A bare host name is read as HTTPS. The result is the origin plus any path
 * prefix, without a trailing slash, so the same server typed two ways compares
 * equal.
 */
export function serverUrlParse(text: string): ServerUrlParse {
    const trimmed = text.trim();
    if (trimmed.length === 0) return { ok: false, problem: "empty" };
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`;
    let url: URL;
    try {
        url = new URL(withScheme);
    } catch {
        return { ok: false, problem: "invalid" };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:")
        return { ok: false, problem: "invalid" };
    if (url.hostname.length === 0) return { ok: false, problem: "invalid" };
    if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname))
        return { ok: false, problem: "insecure" };
    if (url.username.length > 0 || url.password.length > 0)
        return { ok: false, problem: "credentials" };
    if (
        url.search.length > 0 ||
        url.hash.length > 0 ||
        trimmed.endsWith("?") ||
        trimmed.endsWith("#")
    )
        return { ok: false, problem: "extra" };
    const path = url.pathname.replace(/\/+$/u, "");
    return { ok: true, url: `${url.origin}${path}` };
}

/** The sentence a settings field shows for a problem. */
export function serverUrlProblemMessage(problem: ServerUrlProblem): string {
    switch (problem) {
        case "empty":
            return "Enter the server's address.";
        case "invalid":
            return "This isn't a web address. Use the https:// address your team gave you.";
        case "insecure":
            return "Servers are reached over HTTPS. Use an https:// address.";
        case "credentials":
            return "Leave the user name and password out of the address. You sign in in your browser.";
        case "extra":
            return "Use the server's address without anything after ? or #.";
    }
}
