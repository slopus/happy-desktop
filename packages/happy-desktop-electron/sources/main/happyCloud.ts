import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import {
    HAPPY_CLOUD_ACCOUNT_ID,
    HAPPY_CLOUD_API_URL,
    HAPPY_CLOUD_IDENTITY_URL,
    happyCloudConnectionId,
    happyCloudEnterpriseAccountId,
    happyCloudEnterpriseConnectionId,
    happyCloudEnterpriseDiscoveryRead,
    happyCloudEnterpriseKey,
    happyCloudEnterpriseServerId,
    happyCloudServerNameValid,
    happyCloudServerUrl,
    type HappyCloudEnterpriseDiscovery,
    type HappyCloudServer,
} from "../shared/happyCloud";
import type {
    DesktopHappyCloudAvailability,
    DesktopHappyCloudEmailCodeResult,
    DesktopServerSignInResult,
} from "../shared/desktopContract";
import {
    completeOAuthSignIn,
    type OAuthAuthenticationMethod,
    type OAuthCredential,
} from "@slopus/happy-agent-client";
import type {
    ServerSessions,
    ServerSessionsDeps,
    ServerSessionsEnterpriseServer,
} from "./serverSessions";
import type { HappyCloudVault } from "./happyCloudVault";

export interface HappyCloud {
    /** What the sign-ins hold for Happy Cloud: the added servers and the account. */
    readonly direct: NonNullable<ServerSessionsDeps["direct"]>;
    serversList(): Promise<DesktopServerSignInResult<readonly HappyCloudServer[]>>;
    availability(name: string): Promise<DesktopServerSignInResult<DesktopHappyCloudAvailability>>;
    serverCreate(name: string): Promise<DesktopServerSignInResult<HappyCloudServer>>;
    serverJoin(name: string, code: string): Promise<DesktopServerSignInResult<HappyCloudServer>>;
    /** Accepts an invite by the token its link carries; the account then belongs to its server. */
    inviteAccept(token: string): Promise<DesktopServerSignInResult<HappyCloudServer>>;
    /**
     * Has the account API issue tokens for a server the account belongs to,
     * lists it as a connection signed in with them, and returns its
     * connection ID.
     */
    serverConnect(serverId: string): Promise<DesktopServerSignInResult<string>>;
    /** A listed server's picture as a `data:` URL, read with the account token. */
    imageRead(serverId: string): Promise<string | undefined>;
    /** Revokes a server's sign-in at the account API, then forgets the server here. */
    serverRemove(name: string): Promise<void>;
    /** Revokes a server's sign-in and forgets it here, kept copy included; the server stays listed. */
    serverSignOut(name: string): Promise<void>;
    /** Revokes and forgets the account's session; the servers' own sign-ins stay. */
    accountSignOut(): void;
    /**
     * Signs in to a test account with its login and password, which go to
     * the identity provider and nowhere else; the session is held like one
     * from the browser.
     */
    passwordSignIn(login: string, password: string): Promise<DesktopServerSignInResult<void>>;
    /** Has the identity provider email a one-time sign-in code to `email`. */
    emailCodeStart(email: string): Promise<DesktopHappyCloudEmailCodeResult>;
    /**
     * Signs in to the account with the code emailed to `email`; the session
     * is held like one from password sign-in.
     */
    emailCodeVerify(email: string, code: string): Promise<DesktopHappyCloudEmailCodeResult>;
}

type Failure = { readonly ok: false; readonly message: string; readonly code: string };

/**
 * One cloud: an account API with its servers, and the identity provider its
 * account signs in at. Happy Cloud's is built in; an enterprise's comes from
 * its own discovery.
 */
export interface HappyCloudConfig {
    /** What the person reads it as: "Sign in to <name> to continue." */
    readonly name: string;
    /** The account API, `https://api.<base>/`, and the account session's audience. */
    readonly apiUrl: string;
    readonly accountId: string;
    /** How the account signs in, in the browser. */
    readonly method: OAuthAuthenticationMethod;
    /**
     * Happy Cloud's own identity provider, which also signs in by password
     * and by an emailed code. An enterprise's offers only the browser.
     */
    readonly identityUrl?: string;
    serverUrl(name: string): string;
    connectionId(name: string): string;
}

/** Happy Cloud itself. */
export const HAPPY_CLOUD_CONFIG: HappyCloudConfig = {
    name: "Happy Cloud",
    apiUrl: HAPPY_CLOUD_API_URL,
    accountId: HAPPY_CLOUD_ACCOUNT_ID,
    method: {
        type: "oauth",
        id: "happy-cloud",
        name: "Happy Cloud",
        authorizationUrl: new URL("authorize", HAPPY_CLOUD_IDENTITY_URL).href,
        tokenUrl: new URL("token", HAPPY_CLOUD_IDENTITY_URL).href,
        clientId: "happy",
        scope: "openid",
    },
    identityUrl: HAPPY_CLOUD_IDENTITY_URL,
    serverUrl: happyCloudServerUrl,
    connectionId: happyCloudConnectionId,
};

/** An enterprise cloud as its discovery describes it, under its key in this app. */
export function happyCloudEnterpriseConfig(
    key: string,
    discovery: HappyCloudEnterpriseDiscovery,
): HappyCloudConfig {
    return {
        name: discovery.name,
        apiUrl: discovery.api,
        accountId: happyCloudEnterpriseAccountId(key),
        method: {
            type: "oauth",
            id: `enterprise-${key}`,
            name: discovery.identity.name,
            authorizationUrl: discovery.identity.authorizationUrl,
            tokenUrl: discovery.identity.tokenUrl,
            clientId: discovery.identity.clientId,
            scope: discovery.identity.scope,
        },
        serverUrl: (name) => `https://${name}.${discovery.base}/`,
        connectionId: (name) => happyCloudEnterpriseConnectionId(key, name),
    };
}

/**
 * What an address the person entered for Enterprise login turned out to be:
 * a cloud of servers behind its own account API, or one server that signs
 * in on its own. Nothing is signed in to or kept yet.
 */
export type HappyCloudEnterpriseFound =
    | {
          readonly kind: "cloud";
          readonly key: string;
          readonly url: string;
          readonly discovery: HappyCloudEnterpriseDiscovery;
      }
    | { readonly kind: "server"; readonly key: string; readonly url: string };

/**
 * Reads `<address>/.well-known/happy-cloud.json`. A valid document is a
 * cloud; no document at all is a deployment of one server, which says how
 * it signs in itself. A document this app can't take is refused with a
 * sentence to show.
 */
export async function happyCloudEnterpriseDiscover(
    url: string,
    fetch: typeof globalThis.fetch,
): Promise<DesktopServerSignInResult<HappyCloudEnterpriseFound>> {
    const address = new URL(url);
    const key = happyCloudEnterpriseKey(address.origin);
    let response: Response;
    try {
        response = await fetch(new URL(".well-known/happy-cloud.json", address.origin), {
            headers: { accept: "application/json" },
            // An edge's sign-in page is not the deployment's discovery.
            redirect: "error",
        });
    } catch {
        return {
            ok: false,
            message: "Happy couldn't reach this address. Check it and your network.",
            code: "remote_unavailable",
        };
    }
    // No document is a deployment of one server, whose own discovery says
    // the rest: a 404, or a refusal from the edge in front of it, which
    // answers every path it doesn't know with its own sign-in.
    if (!response.ok)
        return { ok: true, value: { kind: "server", key, url: `${address.origin}/` } };
    const json: unknown = await response.json().catch(() => undefined);
    const discovery = happyCloudEnterpriseDiscoveryRead(json, address.host);
    if (!discovery)
        return {
            ok: false,
            message: "This address doesn't describe a Happy deployment this app can use.",
            code: "discovery_invalid",
        };
    return { ok: true, value: { kind: "cloud", key, url: `${address.origin}/`, discovery } };
}

/**
 * Happy Cloud as main holds it. The account's token stays in the sign-ins'
 * memory and is sent only to the account API from here; the window gets the
 * answers. The servers the person added are one JSON list of names in this
 * app's data, so they are listed again after a restart and want a sign-in.
 */
export function happyCloudCreate(input: {
    /** Happy Cloud unless given. */
    readonly config?: HappyCloudConfig;
    /** Where the added servers' names are kept; without it they last this run only. */
    readonly listPath?: string;
    readonly fetch: typeof globalThis.fetch;
    readonly sessions: () => ServerSessions;
    /** Where the servers' sign-ins are kept across restarts, when this computer can. */
    readonly vault?: HappyCloudVault;
}): HappyCloud {
    const config = input.config ?? HAPPY_CLOUD_CONFIG;
    const { apiUrl, accountId } = config;
    const SIGN_IN_REQUIRED: Failure = {
        ok: false,
        message: `Sign in to ${config.name} to continue.`,
        code: "sign_in_required",
    };
    const UNREACHABLE: Failure = {
        ok: false,
        message: `${config.name} isn't reachable right now.`,
        code: "remote_unavailable",
    };
    const UNAVAILABLE: Failure = {
        ok: false,
        message: `${config.name} signs in only in your browser.`,
        code: "unsupported_provider",
    };
    let names = input.listPath === undefined ? [] : listRead(input.listPath);
    const namesWrite = (): void => {
        if (input.listPath === undefined) return;
        void writeFile(input.listPath, `${JSON.stringify(names)}\n`).catch((error: unknown) =>
            console.error("Happy Cloud servers could not be saved.", error),
        );
    };
    /** Each listed server's picture address, from the last list; only the account API's origin. */
    const images = new Map<string, string>();
    const servers = (): ReadonlyMap<string, string> =>
        new Map(names.map((name) => [config.connectionId(name), config.serverUrl(name)]));

    const accountsCall = async <T>(
        method: "GET" | "POST",
        path: string,
        body: unknown,
        read: (status: number, json: Record<string, unknown>) => T | Failure,
    ): Promise<T | Failure> => {
        const sessions = input.sessions();
        const credential = sessions.credential(accountId);
        if (!credential) return SIGN_IN_REQUIRED;
        let response: Response;
        try {
            response = await input.fetch(new URL(path, apiUrl), {
                method,
                headers: {
                    accept: "application/json",
                    authorization: `Bearer ${credential.accessToken}`,
                    ...(body === undefined ? {} : { "content-type": "application/json" }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                redirect: "error",
            });
        } catch {
            return UNREACHABLE;
        }
        const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        // The account's session is never refreshed: a refused one ends it,
        // and the person signs in again.
        if (response.status === 401) {
            sessions.signInRequire(accountId, credential.accessToken);
            return SIGN_IN_REQUIRED;
        }
        return read(response.status, json);
    };

    /** Every server the account was seen to belong to, by ID, from list, create and join. */
    const known = new Map<string, HappyCloudServer>();
    const seen = (server: HappyCloudServer): HappyCloudServer => {
        known.set(server.id, server);
        return server;
    };

    const failure = (json: Record<string, unknown>, fallback: string): Failure => ({
        ok: false,
        message: typeof json.error === "string" && json.error !== "" ? json.error : fallback,
        code: typeof json.code === "string" ? json.code : "failed",
    });

    const result = <T>(value: T | Failure): DesktopServerSignInResult<T> =>
        typeof value === "object" && value !== null && "ok" in value && value.ok === false
            ? value
            : { ok: true, value: value as T };

    /**
     * The cluster's answer to an identity token: the account's session, or
     * its refusal. A token for another app is refused here, never sent on.
     */
    const sessionOpen = async (
        idToken: unknown,
    ): Promise<{ readonly status: number; readonly json: Record<string, unknown> }> => {
        if (typeof idToken !== "string" || !identityTokenForApp(idToken, config.method.clientId))
            return { status: 401, json: { code: "invalid_token" } };
        const response = await input.fetch(new URL("v1/session", apiUrl), {
            method: "POST",
            headers: { accept: "application/json", "content-type": "application/json" },
            body: JSON.stringify({ id_token: idToken }),
            redirect: "error",
        });
        const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        return { status: response.status, json };
    };

    /**
     * Holds the account session the cluster opened. It is never refreshed;
     * its refresh token is kept in memory only to revoke it at sign-out.
     */
    const accountSignIn = (json: Record<string, unknown>): DesktopServerSignInResult<void> => {
        if (typeof json.access_token !== "string" || json.access_token === "")
            return failure(json, "Signing in didn't work.");
        try {
            input.sessions().directSignIn(accountId, {
                accessToken: json.access_token,
                expiresAt:
                    typeof json.expires_in === "number" && json.expires_in > 0
                        ? Date.now() + json.expires_in * 1000
                        : null,
                refreshToken:
                    typeof json.refresh_token === "string" && json.refresh_token !== ""
                        ? json.refresh_token
                        : null,
                refreshUrl: null,
                clientId: "happy",
                resource: apiUrl,
                serverUrl: apiUrl,
            });
        } catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : "Signing in didn't work.",
                code: "failed",
            };
        }
        return { ok: true, value: undefined };
    };

    /** Trades an identity token for the account's session and holds it. */
    const accountSessionOpen = async (
        idToken: unknown,
    ): Promise<DesktopServerSignInResult<void>> => {
        let opened: Awaited<ReturnType<typeof sessionOpen>>;
        try {
            opened = await sessionOpen(idToken);
        } catch {
            return UNREACHABLE;
        }
        if (opened.status !== 200) return failure(opened.json, "Signing in didn't work.");
        return accountSignIn(opened.json);
    };

    /**
     * One step of email-code sign-in, which needs no account pass: its
     * refusals worded for the person, and a refusal for too many tries with
     * how long to wait.
     */
    const emailCall = async (
        path: string,
        body: Record<string, string>,
        unavailable: string,
        answered: (
            json: Record<string, unknown>,
        ) => DesktopHappyCloudEmailCodeResult | Promise<DesktopHappyCloudEmailCodeResult>,
    ): Promise<DesktopHappyCloudEmailCodeResult> => {
        if (config.identityUrl === undefined) return UNAVAILABLE;
        let response: Response;
        try {
            response = await input.fetch(new URL(path, config.identityUrl), {
                method: "POST",
                headers: { accept: "application/json", "content-type": "application/json" },
                body: JSON.stringify(body),
                redirect: "error",
            });
        } catch {
            return UNREACHABLE;
        }
        const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (response.ok) return answered(json);
        const code = typeof json.code === "string" ? json.code : "failed";
        if (response.status === 429)
            return {
                ok: false,
                message: "Too many tries.",
                code: "rate_limited",
                retryAfter: retryAfterRead(response.headers.get("retry-after"), json.retryAfter),
            };
        switch (code) {
            case "invalid_email":
                return { ok: false, message: "That email address doesn't look right.", code };
            case "invalid_code":
                return { ok: false, message: "That code is wrong or has expired.", code };
            case "unavailable":
                return { ok: false, message: unavailable, code };
            case "unsupported_provider":
                return failure(json, "Signing in by email isn't available.");
            default:
                return failure(json, "Signing in didn't work.");
        }
    };

    /** Ends a sign-in here and revokes it at the account API. */
    const signOut = async (connectionId: string): Promise<void> => {
        const refreshToken = input.sessions().directSignOut(connectionId);
        if (refreshToken === null) return;
        // RFC 7009: the answer is always 200, and a failed revocation
        // still leaves the sign-in forgotten here.
        await input
            .fetch(new URL("revoke", apiUrl), {
                method: "POST",
                headers: { "content-type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ token: refreshToken, client_id: "happy" }).toString(),
                redirect: "error",
            })
            .catch(() => undefined);
    };

    /** A server the account now belongs to, from create, join or an invite. */
    const joined =
        (fallback: string) =>
        (status: number, json: Record<string, unknown>): HappyCloudServer | Failure =>
            status === 200 || status === 201
                ? (serverSeen(json.server, seen, config) ?? failure(json, fallback))
                : failure(json, fallback);

    return {
        direct: {
            servers,
            ...(input.vault ? { vault: input.vault } : {}),
            refreshUrl: new URL("token", apiUrl).href,
            account: {
                connectionId: accountId,
                serverUrl: apiUrl,
                method: config.method,
                // The identity provider answers the code with an identity
                // token, which the cluster trades for the account's session:
                // that session is what the sign-in holds.
                signInComplete: (signIn, callbackUrl) =>
                    completeOAuthSignIn(signIn, callbackUrl, {
                        fetch: async (url, init) => {
                            const identity = await input.fetch(url, init);
                            if (!identity.ok) return identity;
                            const json = (await identity.json().catch(() => ({}))) as Record<
                                string,
                                unknown
                            >;
                            const opened = await sessionOpen(json.id_token);
                            if (opened.status === 200)
                                return Response.json({ token_type: "Bearer", ...opened.json });
                            return Response.json(
                                {
                                    error:
                                        typeof opened.json.code === "string"
                                            ? opened.json.code
                                            : "invalid_token",
                                    error_description:
                                        typeof opened.json.error === "string"
                                            ? opened.json.error
                                            : "Signing in didn't work.",
                                },
                                { status: opened.status },
                            );
                        },
                    }),
            },
        },
        async serversList() {
            return result(
                await accountsCall("GET", "v1/servers", undefined, (status, json) => {
                    if (status !== 200 || !Array.isArray(json.servers))
                        return failure(json, "Your servers couldn't be read.");
                    images.clear();
                    return json.servers.flatMap((value) => {
                        const server = serverRead(value, config);
                        if (!server) return [];
                        seen(server);
                        const url = imageUrlRead(value, apiUrl);
                        if (url !== undefined) images.set(server.id, url);
                        return [server];
                    });
                }),
            );
        },
        async availability(name) {
            return result(
                await accountsCall(
                    "GET",
                    `v1/servers/availability?name=${encodeURIComponent(name)}`,
                    undefined,
                    (status, json): DesktopHappyCloudAvailability | Failure =>
                        status !== 200 || typeof json.available !== "boolean"
                            ? failure(json, "That name couldn't be checked.")
                            : json.available
                              ? { available: true }
                              : {
                                    available: false,
                                    reason:
                                        json.reason === "taken" || json.reason === "reserved"
                                            ? json.reason
                                            : "invalid",
                                },
                ),
            );
        },
        async serverCreate(name) {
            return result(
                await accountsCall("POST", "v1/servers", { name }, (status, json) =>
                    status === 201
                        ? (serverSeen(json.server, seen, config) ??
                          failure(json, "The server couldn't be created."))
                        : failure(
                              json,
                              status === 409
                                  ? "That name is taken."
                                  : "The server couldn't be created.",
                          ),
                ),
            );
        },
        async serverJoin(name, code) {
            return result(
                await accountsCall("POST", "v1/servers/join", { name, code }, (status, json) =>
                    status === 200
                        ? (serverSeen(json.server, seen, config) ??
                          failure(json, "Joining didn't work."))
                        : failure(
                              json,
                              status === 404
                                  ? "No server has that name and invite code."
                                  : "Joining didn't work.",
                          ),
                ),
            );
        },
        async inviteAccept(token) {
            return result(
                await accountsCall(
                    "POST",
                    "v1/invites/accept",
                    { token },
                    joined("This invite couldn't be accepted."),
                ),
            );
        },
        async imageRead(serverId) {
            const url = images.get(serverId);
            const credential = input.sessions().credential(accountId);
            if (url === undefined || !credential) return undefined;
            try {
                const response = await input.fetch(url, {
                    headers: { authorization: `Bearer ${credential.accessToken}` },
                    redirect: "error",
                });
                const type = response.headers.get("content-type") ?? "";
                if (!response.ok || !type.startsWith("image/")) return undefined;
                const bytes = Buffer.from(await response.arrayBuffer());
                return `data:${type};base64,${bytes.toString("base64")}`;
            } catch {
                return undefined;
            }
        },
        async serverRemove(name) {
            const connectionId = config.connectionId(name);
            const signedOut = signOut(connectionId);
            if (names.includes(name)) {
                names = names.filter((entry) => entry !== name);
                namesWrite();
                input.sessions().directChanged();
            }
            await signedOut;
        },
        serverSignOut: (name) => signOut(config.connectionId(name)),
        accountSignOut() {
            void signOut(accountId);
        },
        async passwordSignIn(login, password) {
            if (config.identityUrl === undefined) return UNAVAILABLE;
            let response: Response;
            try {
                response = await input.fetch(new URL("v2/auth/password", config.identityUrl), {
                    method: "POST",
                    headers: { accept: "application/json", "content-type": "application/json" },
                    body: JSON.stringify({ login, password }),
                    redirect: "error",
                });
            } catch {
                return UNREACHABLE;
            }
            const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
            if (response.status === 429) {
                const seconds = typeof json.retryAfter === "number" ? json.retryAfter : 60;
                const minutes = Math.max(1, Math.ceil(seconds / 60));
                return {
                    ok: false,
                    message: `Too many tries. Try again in ${String(minutes)} min.`,
                    code: "locked",
                };
            }
            if (response.status === 401)
                return {
                    ok: false,
                    message: "That login or password is wrong.",
                    code: "invalid_credentials",
                };
            if (!response.ok) return failure(json, "Signing in didn't work.");
            return accountSessionOpen(json.id_token);
        },
        emailCodeStart: (email) =>
            emailCall(
                "v2/auth/email/start",
                { email },
                "Happy Cloud couldn't send a code right now. Try again.",
                () => ({ ok: true }),
            ),
        emailCodeVerify: (email, code) =>
            emailCall(
                "v2/auth/email/verify",
                { email, code },
                "Happy Cloud couldn't check the code right now. Try again.",
                async (json) => {
                    const signedIn = await accountSessionOpen(json.id_token);
                    return signedIn.ok ? { ok: true } : signedIn;
                },
            ),
        async serverConnect(serverId) {
            const server = known.get(serverId);
            if (!server)
                return { ok: false, message: "That server isn't one of yours.", code: "not_found" };
            const issued = await accountsCall(
                "POST",
                `v1/servers/${encodeURIComponent(server.id)}/token`,
                undefined,
                (status, json): OAuthCredential | Failure =>
                    status === 200 || status === 201
                        ? (serverTokenRead(json, server.url, apiUrl) ??
                          failure(json, "The server's sign-in couldn't be read."))
                        : failure(json, `${config.name} couldn't sign you in to this server.`),
            );
            if ("ok" in issued) return issued;
            if (!names.includes(server.name)) {
                names = [...names, server.name];
                namesWrite();
                input.sessions().directChanged();
            }
            const connectionId = config.connectionId(server.name);
            try {
                input.sessions().directSignIn(connectionId, issued);
            } catch (error) {
                return {
                    ok: false,
                    message: error instanceof Error ? error.message : "Signing in didn't work.",
                    code: "failed",
                };
            }
            return { ok: true, value: connectionId };
        },
    };
}

/** What Enterprise login found at an address, as the window hears it. */
export type HappyCloudEnterpriseOpened =
    | {
          readonly kind: "cloud";
          readonly key: string;
          readonly url: string;
          readonly name: string;
          /** How its account signs in: the identity provider's name and host. */
          readonly signIn: { readonly name: string; readonly host: string };
      }
    | {
          readonly kind: "server";
          readonly key: string;
          readonly url: string;
          readonly connectionId: string;
      };

export interface HappyCloudEnterprises {
    /** What the sign-ins hold for every enterprise deployment opened in this run. */
    enterprise(): ReturnType<NonNullable<ServerSessionsDeps["enterprise"]>>;
    /**
     * Reads an address's discovery and opens what is there: a cloud, signed
     * in to through its account, or a deployment of one server, listed for
     * a sign-in of its own. Opening it again keeps what it already holds.
     */
    open(url: string): Promise<DesktopServerSignInResult<HappyCloudEnterpriseOpened>>;
    /** An open cloud's account API, by its key. */
    cloud(key: string): HappyCloud | undefined;
    /**
     * Forgets a deployment of one server, revoking nothing: its sign-in, if
     * any, ends here. A cloud stays open; its servers are forgotten one by one.
     */
    serverForget(key: string): void;
}

/**
 * Every enterprise deployment opened in this run, by key. None of it is
 * written anywhere: quitting forgets the deployments, their servers and
 * every sign-in, and the next run starts at Enterprise login again.
 */
export function happyCloudEnterprisesCreate(input: {
    readonly fetch: typeof globalThis.fetch;
    readonly sessions: () => ServerSessions;
}): HappyCloudEnterprises {
    const clouds = new Map<
        string,
        {
            readonly url: string;
            readonly discovery: HappyCloudEnterpriseDiscovery;
            readonly cloud: HappyCloud;
        }
    >();
    /** Deployments of one server, by key, with their addresses. */
    const servers = new Map<string, string>();
    const taken = (key: string, url: string): boolean =>
        (clouds.has(key) && clouds.get(key)!.url !== url) ||
        (servers.has(key) && servers.get(key) !== url);
    return {
        enterprise() {
            const listed = new Map<string, ServerSessionsEnterpriseServer>();
            for (const [key, url] of servers)
                listed.set(happyCloudEnterpriseServerId(key), { url });
            for (const { url, discovery, cloud } of clouds.values())
                for (const [connectionId, serverUrl] of cloud.direct.servers())
                    listed.set(connectionId, {
                        url: serverUrl,
                        cloud: { name: discovery.name, url },
                    });
            return {
                servers: listed,
                accounts: [...clouds.values()].map(({ cloud }) => cloud.direct.account),
            };
        },
        async open(url) {
            const found = await happyCloudEnterpriseDiscover(url, input.fetch);
            if (!found.ok) return found;
            const { key } = found.value;
            if (taken(key, found.value.url))
                return {
                    ok: false,
                    message:
                        "Happy is already signed in to another deployment like this one. Restart Happy to use this one.",
                    code: "conflict",
                };
            if (found.value.kind === "server") {
                if (clouds.delete(key)) input.sessions().directChanged();
                if (!servers.has(key)) {
                    servers.set(key, found.value.url);
                    input.sessions().directChanged();
                }
                return {
                    ok: true,
                    value: {
                        kind: "server",
                        key,
                        url: found.value.url,
                        connectionId: happyCloudEnterpriseServerId(key),
                    },
                };
            }
            const { discovery } = found.value;
            const opened = clouds.get(key);
            // The same document keeps its cloud and every sign-in it holds;
            // a changed one starts over with what it now says.
            if (!opened || JSON.stringify(opened.discovery) !== JSON.stringify(discovery)) {
                servers.delete(key);
                clouds.set(key, {
                    url: found.value.url,
                    discovery,
                    cloud: happyCloudCreate({
                        config: happyCloudEnterpriseConfig(key, discovery),
                        fetch: input.fetch,
                        sessions: input.sessions,
                    }),
                });
                input.sessions().directChanged();
            }
            return {
                ok: true,
                value: {
                    kind: "cloud",
                    key,
                    url: found.value.url,
                    name: discovery.name,
                    signIn: {
                        name: discovery.identity.name,
                        host: new URL(discovery.identity.authorizationUrl).host,
                    },
                },
            };
        },
        cloud: (key) => clouds.get(key)?.cloud,
        serverForget(key) {
            if (!servers.delete(key)) return;
            input.sessions().directSignOut(happyCloudEnterpriseServerId(key));
            input.sessions().directChanged();
        },
    };
}

/**
 * Seconds until the identity provider takes another try: its `Retry-After`
 * header, else the body's `retryAfter`, else a minute.
 */
function retryAfterRead(header: string | null, body: unknown): number {
    const seconds = header !== null && /^\d+$/u.test(header.trim()) ? Number(header) : body;
    return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
        ? Math.ceil(seconds)
        : 60;
}

function listRead(path: string): string[] {
    try {
        const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
        return Array.isArray(parsed)
            ? parsed.filter(
                  (name): name is string =>
                      typeof name === "string" && happyCloudServerNameValid(name),
              )
            : [];
    } catch {
        return [];
    }
}

function serverRead(value: unknown, config: HappyCloudConfig): HappyCloudServer | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const server = value as Record<string, unknown>;
    if (
        typeof server.id !== "string" ||
        typeof server.name !== "string" ||
        !happyCloudServerNameValid(server.name)
    )
        return undefined;
    const image = server.image as Record<string, unknown> | null | undefined;
    return {
        id: server.id,
        name: server.name,
        displayName:
            typeof server.displayName === "string" && server.displayName.trim() !== ""
                ? server.displayName
                : server.name,
        // The address is this build's, from the name: never one the API hands over.
        url: config.serverUrl(server.name),
        ...(typeof image?.thumbhash === "string" ? { image: { thumbhash: image.thumbhash } } : {}),
    };
}

function serverSeen(
    value: unknown,
    seen: (server: HappyCloudServer) => HappyCloudServer,
    config: HappyCloudConfig,
): HappyCloudServer | undefined {
    const server = serverRead(value, config);
    return server ? seen(server) : undefined;
}

/**
 * The server tokens the account API issued for `serverUrl`. They refresh at
 * the account API with no account token, for that server alone.
 */
function serverTokenRead(
    json: Record<string, unknown>,
    serverUrl: string,
    apiUrl: string,
): OAuthCredential | undefined {
    if (typeof json.access_token !== "string" || json.access_token === "") return undefined;
    return {
        accessToken: json.access_token,
        expiresAt:
            typeof json.expires_in === "number" && json.expires_in > 0
                ? Date.now() + json.expires_in * 1000
                : null,
        refreshToken:
            typeof json.refresh_token === "string" && json.refresh_token !== ""
                ? json.refresh_token
                : null,
        refreshUrl: new URL("token", apiUrl).href,
        clientId: "happy",
        resource: serverUrl,
        serverUrl,
    };
}

/** A server's picture address, only when it is on the account API's origin the token belongs to. */
function imageUrlRead(value: unknown, apiUrl: string): string | undefined {
    const image = (value as { readonly image?: { readonly url?: unknown } | null }).image;
    if (typeof image?.url !== "string") return undefined;
    try {
        const url = new URL(image.url, apiUrl);
        return url.origin === new URL(apiUrl).origin ? url.href : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Whether an identity token was issued to this app (`aud` names its client,
 * `happy` at Happy Cloud). It is not verified here; the cluster verifies it,
 * and this only keeps a token meant for another app from being sent on.
 */
function identityTokenForApp(token: string, clientId: string): boolean {
    try {
        const claims = JSON.parse(
            Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
        ) as { readonly aud?: unknown };
        const audiences = typeof claims.aud === "string" ? [claims.aud] : claims.aud;
        return Array.isArray(audiences) && audiences.includes(clientId);
    } catch {
        return false;
    }
}
