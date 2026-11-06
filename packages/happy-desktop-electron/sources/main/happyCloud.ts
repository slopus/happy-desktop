import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import {
    HAPPY_CLOUD_ACCOUNT_ID,
    HAPPY_CLOUD_ACCOUNTS_URL,
    happyCloudConnectionId,
    happyCloudServerNameValid,
    happyCloudServerUrl,
    type HappyCloudServer,
} from "../shared/happyCloud";
import type {
    DesktopHappyCloudAvailability,
    DesktopServerSignInResult,
} from "../shared/desktopContract";
import type { OAuthCredential } from "@slopus/happy-agent-client";
import type { ServerSessions, ServerSessionsDeps } from "./serverSessions";

export interface HappyCloud {
    /** What the sign-ins hold for Happy Cloud: the added servers and the account. */
    readonly direct: NonNullable<ServerSessionsDeps["direct"]>;
    serversList(): Promise<DesktopServerSignInResult<readonly HappyCloudServer[]>>;
    availability(name: string): Promise<DesktopServerSignInResult<DesktopHappyCloudAvailability>>;
    serverCreate(name: string): Promise<DesktopServerSignInResult<HappyCloudServer>>;
    serverJoin(name: string, code: string): Promise<DesktopServerSignInResult<HappyCloudServer>>;
    /**
     * Has the accounts service issue tokens for a server the account belongs
     * to, lists it as a connection signed in with them, and returns its
     * connection ID.
     */
    serverConnect(serverId: string): Promise<DesktopServerSignInResult<string>>;
    /** A listed server's picture as a `data:` URL, read with the account token. */
    imageRead(serverId: string): Promise<string | undefined>;
    /** Revokes a server's sign-in at the accounts service, then forgets the server here. */
    serverRemove(name: string): Promise<void>;
    /** Forgets the account's pass; the servers' own sign-ins stay. */
    accountSignOut(): void;
    /**
     * Signs in to a test account with its login and password, which go to
     * the accounts service and nowhere else; the pass is held like one from
     * the browser.
     */
    passwordSignIn(login: string, password: string): Promise<DesktopServerSignInResult<void>>;
}

type Failure = { readonly ok: false; readonly message: string; readonly code: string };

const SIGN_IN_REQUIRED: Failure = {
    ok: false,
    message: "Sign in to Happy Cloud to continue.",
    code: "sign_in_required",
};

/**
 * Happy Cloud as main holds it. The account's token stays in the sign-ins'
 * memory and is sent only to the accounts API from here; the window gets the
 * answers. The servers the person added are one JSON list of names in this
 * app's data, so they are listed again after a restart and want a sign-in.
 */
export function happyCloudCreate(input: {
    readonly listPath: string;
    readonly fetch: typeof globalThis.fetch;
    readonly sessions: () => ServerSessions;
}): HappyCloud {
    let names = listRead(input.listPath);
    /** Each listed server's picture address, from the last list; only the accounts origin. */
    const images = new Map<string, string>();
    const servers = (): ReadonlyMap<string, string> =>
        new Map(names.map((name) => [happyCloudConnectionId(name), happyCloudServerUrl(name)]));

    const accountsCall = async <T>(
        method: "GET" | "POST",
        path: string,
        body: unknown,
        read: (status: number, json: Record<string, unknown>) => T | Failure,
    ): Promise<T | Failure> => {
        const sessions = input.sessions();
        const credential = sessions.credential(HAPPY_CLOUD_ACCOUNT_ID);
        if (!credential) return SIGN_IN_REQUIRED;
        let response: Response;
        try {
            response = await input.fetch(new URL(path, HAPPY_CLOUD_ACCOUNTS_URL), {
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
            return {
                ok: false,
                message: "Happy Cloud isn't reachable right now.",
                code: "remote_unavailable",
            };
        }
        const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        // The account's pass is never refreshed: a refused one ends it, and
        // the person signs in again.
        if (response.status === 401) {
            sessions.signInRequire(HAPPY_CLOUD_ACCOUNT_ID, credential.accessToken);
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

    return {
        direct: {
            servers,
            account: {
                connectionId: HAPPY_CLOUD_ACCOUNT_ID,
                serverUrl: HAPPY_CLOUD_ACCOUNTS_URL,
                method: {
                    type: "oauth",
                    id: "happy-cloud",
                    name: "Happy Cloud",
                    authorizationUrl: new URL("authorize", HAPPY_CLOUD_ACCOUNTS_URL).href,
                    tokenUrl: new URL("token", HAPPY_CLOUD_ACCOUNTS_URL).href,
                    clientId: "happy",
                    resource: HAPPY_CLOUD_ACCOUNTS_URL,
                },
            },
        },
        async serversList() {
            return result(
                await accountsCall("GET", "v1/servers", undefined, (status, json) => {
                    if (status !== 200 || !Array.isArray(json.servers))
                        return failure(json, "Your servers couldn't be read.");
                    images.clear();
                    return json.servers.flatMap((value) => {
                        const server = serverRead(value);
                        if (!server) return [];
                        seen(server);
                        const url = imageUrlRead(value);
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
                        ? (serverSeen(json.server, seen) ??
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
                        ? (serverSeen(json.server, seen) ?? failure(json, "Joining didn't work."))
                        : failure(
                              json,
                              status === 404
                                  ? "No server has that name and invite code."
                                  : "Joining didn't work.",
                          ),
                ),
            );
        },
        async imageRead(serverId) {
            const url = images.get(serverId);
            const credential = input.sessions().credential(HAPPY_CLOUD_ACCOUNT_ID);
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
            const connectionId = happyCloudConnectionId(name);
            const refreshToken = input.sessions().directSignOut(connectionId);
            if (names.includes(name)) {
                names = names.filter((entry) => entry !== name);
                void writeFile(input.listPath, `${JSON.stringify(names)}\n`).catch(
                    (error: unknown) =>
                        console.error("Happy Cloud servers could not be saved.", error),
                );
                input.sessions().directChanged();
            }
            if (refreshToken === null) return;
            // RFC 7009: the answer is always 200, and a failed revocation
            // still leaves the server forgotten here.
            await input
                .fetch(new URL("revoke", HAPPY_CLOUD_ACCOUNTS_URL), {
                    method: "POST",
                    headers: { "content-type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        token: refreshToken,
                        client_id: "happy",
                    }).toString(),
                    redirect: "error",
                })
                .catch(() => undefined);
        },
        accountSignOut() {
            const sessions = input.sessions();
            const credential = sessions.credential(HAPPY_CLOUD_ACCOUNT_ID);
            if (credential) sessions.signInRequire(HAPPY_CLOUD_ACCOUNT_ID, credential.accessToken);
        },
        async passwordSignIn(login, password) {
            let response: Response;
            try {
                response = await input.fetch(
                    new URL("v1/auth/password", HAPPY_CLOUD_ACCOUNTS_URL),
                    {
                        method: "POST",
                        headers: { accept: "application/json", "content-type": "application/json" },
                        body: JSON.stringify({ login, password }),
                        redirect: "error",
                    },
                );
            } catch {
                return {
                    ok: false,
                    message: "Happy Cloud isn't reachable right now.",
                    code: "remote_unavailable",
                };
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
            if (!response.ok || typeof json.access_token !== "string" || json.access_token === "")
                return failure(json, "Signing in didn't work.");
            try {
                input.sessions().directSignIn(HAPPY_CLOUD_ACCOUNT_ID, {
                    accessToken: json.access_token,
                    expiresAt:
                        typeof json.expires_in === "number" && json.expires_in > 0
                            ? Date.now() + json.expires_in * 1000
                            : null,
                    refreshToken: null,
                    refreshUrl: null,
                    clientId: "happy",
                    resource: HAPPY_CLOUD_ACCOUNTS_URL,
                    serverUrl: HAPPY_CLOUD_ACCOUNTS_URL,
                });
            } catch (error) {
                return {
                    ok: false,
                    message: error instanceof Error ? error.message : "Signing in didn't work.",
                    code: "failed",
                };
            }
            return { ok: true, value: undefined };
        },
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
                        ? (serverTokenRead(json, server.url) ??
                          failure(json, "The server's sign-in couldn't be read."))
                        : failure(json, "Happy Cloud couldn't sign you in to this server."),
            );
            if ("ok" in issued) return issued;
            if (!names.includes(server.name)) {
                names = [...names, server.name];
                void writeFile(input.listPath, `${JSON.stringify(names)}\n`).catch(
                    (error: unknown) =>
                        console.error("Happy Cloud servers could not be saved.", error),
                );
                input.sessions().directChanged();
            }
            const connectionId = happyCloudConnectionId(server.name);
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

function serverRead(value: unknown): HappyCloudServer | undefined {
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
        url: happyCloudServerUrl(server.name),
        role: server.role === "owner" ? "owner" : "member",
        ...(typeof image?.thumbhash === "string" ? { image: { thumbhash: image.thumbhash } } : {}),
    };
}

function serverSeen(
    value: unknown,
    seen: (server: HappyCloudServer) => HappyCloudServer,
): HappyCloudServer | undefined {
    const server = serverRead(value);
    return server ? seen(server) : undefined;
}

/**
 * The server tokens the accounts service issued for `serverUrl`. They refresh
 * at the accounts origin with no account token, for that server alone.
 */
function serverTokenRead(
    json: Record<string, unknown>,
    serverUrl: string,
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
        refreshUrl: new URL("token", HAPPY_CLOUD_ACCOUNTS_URL).href,
        clientId: "happy",
        resource: serverUrl,
        serverUrl,
    };
}

/** A server's picture address, only when it is on the accounts origin the token belongs to. */
function imageUrlRead(value: unknown): string | undefined {
    const image = (value as { readonly image?: { readonly url?: unknown } | null }).image;
    if (typeof image?.url !== "string") return undefined;
    try {
        const url = new URL(image.url, HAPPY_CLOUD_ACCOUNTS_URL);
        return url.origin === new URL(HAPPY_CLOUD_ACCOUNTS_URL).origin ? url.href : undefined;
    } catch {
        return undefined;
    }
}
