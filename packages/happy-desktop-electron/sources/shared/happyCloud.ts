/**
 * Happy Cloud: an accounts service and the servers it lists, every one of
 * them reached directly from this app, never through the host Happy Agent.
 * `HAPPY_CLOUD_BASE` is the one place the domain is set.
 */
export const HAPPY_CLOUD_BASE = "24-144-71-103.sslip.io";
/** Where the person's Happy Cloud account signs in and lists their servers. */
export const HAPPY_CLOUD_ACCOUNTS_URL = `https://accounts.${HAPPY_CLOUD_BASE}/`;
/**
 * The sign-in ID of the account itself. Its token is only for the accounts
 * API: it is never listed as a connection and never sent to a server.
 */
export const HAPPY_CLOUD_ACCOUNT_ID = "happy-cloud-account";

const SERVER_PREFIX = "cloud-";
const SERVER_NAME = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/u;

/** One server the account belongs to, as the accounts API lists it. */
export interface HappyCloudServer {
    readonly id: string;
    readonly name: string;
    /** The server's own name for itself, or `name` while it has none. */
    readonly displayName: string;
    readonly url: string;
    readonly role: "owner" | "member";
    /**
     * The server's picture: its ThumbHash, painted until the bytes arrive
     * through `DesktopHappyCloud.imageRead`. Absent when it has none.
     */
    readonly image?: { readonly thumbhash: string };
}

/** Whether a server name is one Happy Cloud could have issued. */
export function happyCloudServerNameValid(name: string): boolean {
    return SERVER_NAME.test(name);
}

/** The server's address: `https://<name>.<base>/`. */
export function happyCloudServerUrl(name: string): string {
    return `https://${name}.${HAPPY_CLOUD_BASE}/`;
}

/**
 * The connection ID a Happy Cloud server has in this app. The window reaches
 * it at `/v0/connections/<id>/api/*` like any connection, and the transport
 * sends those requests to the server itself, so a host connection given an
 * ID of this shape would be shadowed by it.
 */
export function happyCloudConnectionId(name: string): string {
    return `${SERVER_PREFIX}${name}`;
}

/** The server name a connection ID names, or `undefined` when it is not a Happy Cloud server. */
export function happyCloudServerNameOf(connectionId: string): string | undefined {
    if (!connectionId.startsWith(SERVER_PREFIX)) return undefined;
    const name = connectionId.slice(SERVER_PREFIX.length);
    return happyCloudServerNameValid(name) ? name : undefined;
}
