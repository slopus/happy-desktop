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

/**
 * The code a phone scans to add a whole enterprise cloud:
 * `happy://cloud?url=<percent-encoded https://<base>/>`. The phone reads the
 * cloud's discovery at that address and signs in to its account there.
 * `undefined` unless the address is exactly an `https` origin and `/`.
 */
export function happyCloudCodeFormat(url: string): string | undefined {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return undefined;
    }
    if (parsed.protocol !== "https:" || `${parsed.origin}/` !== url) return undefined;
    const code = `happy://cloud?url=${encodeURIComponent(url)}`;
    return code.length > SERVER_CODE_MAX ? undefined : code;
}
