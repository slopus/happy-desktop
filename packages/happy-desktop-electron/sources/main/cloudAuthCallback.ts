/**
 * The Cloud sign-in callback the system opened Happy with, or nothing for any
 * other URL.
 *
 * Happy Agent accepts a callback only on the exact path of `redirectUri`, and
 * Windows hands the app `happy-auth://callback/?…` for the empty-path
 * `happy-auth://callback`, so that `/` is read as the empty path it stands for.
 */
export function cloudAuthCallbackRead(candidate: string, redirectUri: string): string | undefined {
    const redirect = new URL(redirectUri);
    let parsed: URL;
    try {
        parsed = new URL(candidate);
    } catch {
        return undefined;
    }
    if (parsed.protocol !== redirect.protocol || parsed.host !== redirect.host) return undefined;
    if (parsed.pathname === "/" && redirect.pathname === "") parsed.pathname = "";
    return parsed.href;
}
