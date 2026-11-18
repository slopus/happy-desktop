/**
 * Happy Cloud: an identity provider, the cluster's account API, and the
 * servers it lists, every one of them reached directly from this app, never
 * through the host Happy Agent. Each address is set in one place here.
 */
/** The domain every server sits under, as `<name>.<base>`. */
export const HAPPY_CLOUD_BASE = "happy-clusters.com";
/**
 * Where the person signs in, for an identity token that only the account API
 * takes. Nothing else is asked of it.
 */
export const HAPPY_CLOUD_IDENTITY_URL = "https://auth.happy.engineering/";
/**
 * The cluster's account API: the account's session, its servers and their
 * tokens. Also the audience of the account's session.
 */
export const HAPPY_CLOUD_API_URL = `https://api.${HAPPY_CLOUD_BASE}/`;
/**
 * The sign-in ID of the account itself. Its token is only for the account
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

/**
 * The server name a connection ID names, or `undefined` when the host Happy
 * Agent reaches it. Every connection this app reaches itself has one: a
 * Happy Cloud or enterprise cloud server its name, and an enterprise
 * deployment that is one server its key. `happyCloudDirectOf` tells them apart.
 */
export function happyCloudServerNameOf(connectionId: string): string | undefined {
    const direct = happyCloudDirectOf(connectionId);
    return direct === undefined
        ? undefined
        : direct.kind === "enterpriseServer"
          ? direct.key
          : direct.name;
}

const ENTERPRISE_PREFIX = "ent-";
const ENTERPRISE_ACCOUNT_PREFIX = "enterprise-account-";
const ENTERPRISE_KEY = /^[a-z0-9]{7}$/u;

/**
 * An enterprise deployment's short key in this app's connection IDs, from
 * its address: FNV-1a in base 36. Two deployments that share a key cannot
 * both be signed in to in one run; the second is refused.
 */
export function happyCloudEnterpriseKey(origin: string): string {
    let hash = 0x811c9dc5;
    for (const unit of new TextEncoder().encode(origin)) {
        hash ^= unit;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36).padStart(7, "0");
}

/** A server of an enterprise cloud, as `ent-<key>-<name>`. */
export function happyCloudEnterpriseConnectionId(key: string, name: string): string {
    return `${ENTERPRISE_PREFIX}${key}-${name}`;
}

/** An enterprise deployment that is one server, as `ent-<key>`. */
export function happyCloudEnterpriseServerId(key: string): string {
    return `${ENTERPRISE_PREFIX}${key}`;
}

/**
 * The sign-in ID of an enterprise cloud's account. Like Happy Cloud's, it is
 * never listed as a connection and never sent to a server.
 */
export function happyCloudEnterpriseAccountId(key: string): string {
    return `${ENTERPRISE_ACCOUNT_PREFIX}${key}`;
}

/**
 * A connection this app reaches itself rather than through the host Happy
 * Agent: a Happy Cloud server, a server of an enterprise cloud, or an
 * enterprise deployment that is one server.
 */
export type HappyCloudDirect =
    | { readonly kind: "happyCloud"; readonly name: string }
    | { readonly kind: "enterpriseCloud"; readonly key: string; readonly name: string }
    | { readonly kind: "enterpriseServer"; readonly key: string };

/** What a connection ID names, or `undefined` when the host Happy Agent reaches it. */
export function happyCloudDirectOf(connectionId: string): HappyCloudDirect | undefined {
    if (connectionId.startsWith(SERVER_PREFIX)) {
        const name = connectionId.slice(SERVER_PREFIX.length);
        return happyCloudServerNameValid(name) ? { kind: "happyCloud", name } : undefined;
    }
    if (!connectionId.startsWith(ENTERPRISE_PREFIX)) return undefined;
    const rest = connectionId.slice(ENTERPRISE_PREFIX.length);
    const key = rest.slice(0, 7);
    if (!ENTERPRISE_KEY.test(key)) return undefined;
    if (rest.length === 7) return { kind: "enterpriseServer", key };
    const name = rest.slice(8);
    return rest[7] === "-" && happyCloudServerNameValid(name)
        ? { kind: "enterpriseCloud", key, name }
        : undefined;
}

/** The enterprise key an account sign-in ID names, or `undefined` for any other. */
export function happyCloudEnterpriseAccountKeyOf(connectionId: string): string | undefined {
    if (!connectionId.startsWith(ENTERPRISE_ACCOUNT_PREFIX)) return undefined;
    const key = connectionId.slice(ENTERPRISE_ACCOUNT_PREFIX.length);
    return ENTERPRISE_KEY.test(key) ? key : undefined;
}

/**
 * An enterprise deployment's `/.well-known/happy-cloud.json`, as this app
 * took it: one with several servers behind its own account API, signed in to
 * through the company's identity provider.
 */
export interface HappyCloudEnterpriseDiscovery {
    readonly name: string;
    /** The host every server sits under, as `<name>.<base>`: the address the person entered. */
    readonly base: string;
    /** `https://api.<base>/`. */
    readonly api: string;
    readonly identity: {
        readonly name: string;
        readonly authorizationUrl: string;
        readonly tokenUrl: string;
        readonly clientId: string;
        readonly scope: string;
    };
    /** The host invite links are on. */
    readonly invite?: string;
}

/**
 * Takes a deployment's discovery document only when it is bound to the
 * address the person entered: version 1, `base` that very host, `api`
 * exactly `https://api.<base>/`, and both identity endpoints on one https
 * origin. Unknown fields are ignored.
 */
export function happyCloudEnterpriseDiscoveryRead(
    value: unknown,
    host: string,
): HappyCloudEnterpriseDiscovery | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const doc = value as Record<string, unknown>;
    const identity = doc.identity as Record<string, unknown> | null | undefined;
    if (
        doc.version !== 1 ||
        typeof doc.name !== "string" ||
        doc.name.trim() === "" ||
        doc.base !== host ||
        doc.api !== `https://api.${host}/` ||
        typeof identity !== "object" ||
        identity === null ||
        typeof identity.name !== "string" ||
        identity.name.trim() === "" ||
        typeof identity.authorizationUrl !== "string" ||
        typeof identity.tokenUrl !== "string" ||
        typeof identity.clientId !== "string" ||
        identity.clientId === ""
    )
        return undefined;
    let authorization: URL;
    let token: URL;
    try {
        authorization = new URL(identity.authorizationUrl);
        token = new URL(identity.tokenUrl);
    } catch {
        return undefined;
    }
    if (authorization.protocol !== "https:" || authorization.origin !== token.origin)
        return undefined;
    const invite =
        typeof doc.invite === "string" && /^[a-z0-9.-]+(?::\d+)?$/u.test(doc.invite)
            ? doc.invite
            : undefined;
    return {
        name: doc.name.trim(),
        base: host,
        api: doc.api,
        identity: {
            name: identity.name.trim(),
            authorizationUrl: authorization.href,
            tokenUrl: token.href,
            clientId: identity.clientId,
            scope: typeof identity.scope === "string" ? identity.scope : "openid",
        },
        ...(invite === undefined ? {} : { invite }),
    };
}
