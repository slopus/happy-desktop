/*
 * Happy Cloud invite links. An invitation is one secret token, carried only in
 * the fragment of one of two addresses:
 *
 *     https://happybases.com/join#<token>    the link people are sent
 *     happy://cloud/join#<token>             what the web join page opens
 *
 * The token is the whole invitation, so it is never logged, never put in a
 * query string, never kept in navigation history or persisted state, and goes
 * nowhere but Happy Cloud's invite preview and accept. Nothing here reads a
 * token from anywhere but the fragment.
 */

/** What an invite token looks like: 43 URL-safe characters, and nothing else. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/u;

/** The two addresses an invite is at; whatever follows is the fragment, or a mistake. */
const ADDRESSES = ["happy://cloud/join", "https://happybases.com/join"] as const;

/** The longest an invite link is: its address, `#`, and the token. */
const LENGTH_MAX = Math.max(...ADDRESSES.map((address) => address.length)) + 1 + 43;

/** An invite link as the window acts on it. */
export type HappyCloudInviteLink =
    /** A well-formed invite: Happy Cloud says what it is an invitation to. */
    | { readonly kind: "invite"; readonly token: string }
    /**
     * An invite address whose token is missing, misshapen, over-long, or
     * somewhere other than the fragment: said to be invalid without asking
     * Happy Cloud anything.
     */
    | { readonly kind: "invalid" };

/** Whether `token` has the shape of an invite token. */
export function happyCloudInviteTokenValid(token: string): boolean {
    return TOKEN.test(token);
}

/**
 * Reads an invite link, or answers nothing for any other address: another
 * path, another host, another scheme. An address that is an invite's but does
 * not carry exactly one well-formed token in its fragment is `invalid`.
 */
export function happyCloudInviteLinkParse(url: string): HappyCloudInviteLink | undefined {
    for (const address of ADDRESSES) {
        if (!url.startsWith(address)) continue;
        const rest = url.slice(address.length);
        // `/join/x` and `/joins` are other paths, not this one with a bad token.
        if (rest !== "" && !rest.startsWith("#") && !rest.startsWith("?")) continue;
        if (url.length > LENGTH_MAX || !rest.startsWith("#")) return { kind: "invalid" };
        const token = rest.slice(1);
        return happyCloudInviteTokenValid(token) ? { kind: "invite", token } : { kind: "invalid" };
    }
    return undefined;
}
