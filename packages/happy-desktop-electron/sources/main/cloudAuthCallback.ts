/**
 * The Cloud sign-in callback the system opened Happy with, or nothing for any
 * other URL.
 */
export function cloudAuthCallbackRead(candidate: string, redirectUri: string): string | undefined {
    const redirect = new URL(redirectUri);
    try {
        const parsed = new URL(candidate);
        return parsed.protocol === redirect.protocol && parsed.host === redirect.host
            ? parsed.href
            : undefined;
    } catch {
        return undefined;
    }
}
