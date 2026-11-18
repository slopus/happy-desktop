/** An installation's health `instanceId`, as a server code names it. */
const INSTANCE_ID = /^[a-z][a-z0-9]{23}$/u;
/** The longest server code a phone takes. */
const SERVER_CODE_MAX = 4096;

/**
 * The server code a phone scans to add a team server:
 * `happy://<instanceId>/server?url=<percent-encoded base URL>`, by the edge
 * SSO contract. It carries the server's normalized address and installation,
 * never a token. `undefined` when the instance ID or the address isn't one a
 * phone takes: the address must already be a normalized `https` base URL.
 */
export function happyServerCodeFormat(instanceId: string, url: string): string | undefined {
    if (!INSTANCE_ID.test(instanceId)) return undefined;
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return undefined;
    }
    if (parsed.protocol !== "https:" || parsed.href !== url || !parsed.pathname.endsWith("/"))
        return undefined;
    if (
        parsed.username !== "" ||
        parsed.password !== "" ||
        parsed.search !== "" ||
        parsed.hash !== ""
    )
        return undefined;
    const code = `happy://${instanceId}/server?url=${encodeURIComponent(url)}`;
    return code.length > SERVER_CODE_MAX ? undefined : code;
}
