/** A typed Enterprise login address, as the shell takes it, or why it can't be one. */
export type DesktopServerAddress =
    | { readonly ok: true; readonly url: string; readonly host: string }
    | { readonly ok: false; readonly message: string };

/** Hosts a deployment may be reached over plain `http` at, for local testing. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Reads the address the person typed for Enterprise login. One without a
 * scheme is an `https` address. A deployment is a whole origin, so the
 * result is that origin and `/`: scheme and host lowercased, a default port
 * dropped.
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
            message: "That isn’t a web address. Enter one like acme.example.",
        };
    }
    if (
        url.protocol !== "https:" &&
        !(url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname))
    )
        return { ok: false, message: "Happy connects over https only." };
    if (
        url.username !== "" ||
        url.password !== "" ||
        url.search !== "" ||
        url.hash !== "" ||
        url.pathname !== "/"
    )
        return {
            ok: false,
            message:
                "Enter only the address, like acme.example, without a path or sign-in details.",
        };
    return { ok: true, url: `${url.origin}/`, host: url.host };
}
