import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import {
    HAPPY_CLOUD_ACCOUNT_ID,
    HAPPY_CLOUD_API_URL,
    HAPPY_CLOUD_IDENTITY_URL,
    happyCloudConnectionId,
    happyCloudServerNameValid,
    happyCloudServerUrl,
    type HappyCloudServer,
} from "../shared/happyCloud";
import type {
    DesktopHappyCloudAvailability,
    DesktopHappyCloudEmailCodeResult,
    DesktopServerSignInResult,
} from "../shared/desktopContract";
import { completeOAuthSignIn, type OAuthCredential } from "@slopus/happy-agent-client";
import type {
    HappyCloudInviteAcceptResult,
    HappyCloudInviteClosedCode,
    HappyCloudInvitePreview,
    HappyCloudInvitePreviewResult,
} from "happy-desktop-state";
import type { ServerSessions, ServerSessionsDeps } from "./serverSessions";
import type { HappyCloudVault } from "./happyCloudVault";

export interface HappyCloud {
    /** What the sign-ins hold for Happy Cloud: the added servers and the account. */
    readonly direct: NonNullable<ServerSessionsDeps["direct"]>;
    serversList(): Promise<DesktopServerSignInResult<readonly HappyCloudServer[]>>;
    availability(name: string): Promise<DesktopServerSignInResult<DesktopHappyCloudAvailability>>;
    serverCreate(name: string): Promise<DesktopServerSignInResult<HappyCloudServer>>;
    serverJoin(name: string, code: string): Promise<DesktopServerSignInResult<HappyCloudServer>>;
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
    /**
     * What an invitation is to, by its token. Asked with no account session
     * and no cookies: anyone holding the link may read it.
     */
    invitePreview(token: string): Promise<HappyCloudInvitePreviewResult>;
    /**
     * Accepts an invitation as the signed-in account. The server it answers
     * with is one of the account's from then on, so `serverConnect` takes it.
     * The token goes to the account API in the request's body and nowhere else.
     */
    inviteAccept(token: string): Promise<HappyCloudInviteAcceptResult>;
}

type Failure = { readonly ok: false; readonly message: string; readonly code: string };

const SIGN_IN_REQUIRED: Failure = {
    ok: false,
    message: "Sign in to Happy Cloud to continue.",
    code: "sign_in_required",
};

const UNREACHABLE: Failure = {
    ok: false,
    message: "Happy Cloud isn't reachable right now.",
    code: "remote_unavailable",
};

/**
 * Happy Cloud as main holds it. The account's token stays in the sign-ins'
 * memory and is sent only to the account API from here; the window gets the
 * answers. The servers the person added are one JSON list of names in this
 * app's data, so they are listed again after a restart and want a sign-in.
 */
export function happyCloudCreate(input: {
    readonly listPath: string;
    readonly fetch: typeof globalThis.fetch;
    readonly sessions: () => ServerSessions;
    /** Where the servers' sign-ins are kept across restarts, when this computer can. */
    readonly vault?: HappyCloudVault;
}): HappyCloud {
    let names = listRead(input.listPath);
    /** Each listed server's picture address, from the last list; only the account API's origin. */
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
            response = await input.fetch(new URL(path, HAPPY_CLOUD_API_URL), {
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

    /**
     * The cluster's answer to an identity token: the account's session, or
     * its refusal. A token for another app is refused here, never sent on.
     */
    const sessionOpen = async (
        idToken: unknown,
    ): Promise<{ readonly status: number; readonly json: Record<string, unknown> }> => {
        if (typeof idToken !== "string" || !identityTokenForApp(idToken))
            return { status: 401, json: { code: "invalid_token" } };
        const response = await input.fetch(new URL("v1/session", HAPPY_CLOUD_API_URL), {
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
            input.sessions().directSignIn(HAPPY_CLOUD_ACCOUNT_ID, {
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
                resource: HAPPY_CLOUD_API_URL,
                serverUrl: HAPPY_CLOUD_API_URL,
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
        let response: Response;
        try {
            response = await input.fetch(new URL(path, HAPPY_CLOUD_IDENTITY_URL), {
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
            .fetch(new URL("revoke", HAPPY_CLOUD_API_URL), {
                method: "POST",
                headers: { "content-type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ token: refreshToken, client_id: "happy" }).toString(),
                redirect: "error",
            })
            .catch(() => undefined);
    };

    return {
        direct: {
            servers,
            ...(input.vault ? { vault: input.vault } : {}),
            refreshUrl: new URL("token", HAPPY_CLOUD_API_URL).href,
            account: {
                connectionId: HAPPY_CLOUD_ACCOUNT_ID,
                serverUrl: HAPPY_CLOUD_API_URL,
                method: {
                    type: "oauth",
                    id: "happy-cloud",
                    name: "Happy Cloud",
                    authorizationUrl: new URL("authorize", HAPPY_CLOUD_IDENTITY_URL).href,
                    tokenUrl: new URL("token", HAPPY_CLOUD_IDENTITY_URL).href,
                    clientId: "happy",
                    scope: "openid",
                },
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
            const signedOut = signOut(connectionId);
            if (names.includes(name)) {
                names = names.filter((entry) => entry !== name);
                void writeFile(input.listPath, `${JSON.stringify(names)}\n`).catch(
                    (error: unknown) =>
                        console.error("Happy Cloud servers could not be saved.", error),
                );
                input.sessions().directChanged();
            }
            await signedOut;
        },
        serverSignOut: (name) => signOut(happyCloudConnectionId(name)),
        accountSignOut() {
            void signOut(HAPPY_CLOUD_ACCOUNT_ID);
        },
        async passwordSignIn(login, password) {
            let response: Response;
            try {
                response = await input.fetch(
                    new URL("v2/auth/password", HAPPY_CLOUD_IDENTITY_URL),
                    {
                        method: "POST",
                        headers: { accept: "application/json", "content-type": "application/json" },
                        body: JSON.stringify({ login, password }),
                        redirect: "error",
                    },
                );
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
        async invitePreview(token) {
            let response: Response;
            try {
                response = await input.fetch(new URL("v1/invites/preview", HAPPY_CLOUD_API_URL), {
                    method: "POST",
                    headers: { accept: "application/json", "content-type": "application/json" },
                    body: JSON.stringify({ token }),
                    credentials: "omit",
                    redirect: "error",
                });
            } catch {
                return { kind: "failed", message: UNREACHABLE.message };
            }
            const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
            if (response.status === 410) return inviteClosedRead(json);
            const invite = response.status === 200 ? invitePreviewRead(json) : undefined;
            if (invite) return { kind: "invite", invite };
            return {
                kind: "failed",
                message:
                    response.status >= 500
                        ? UNREACHABLE.message
                        : "Happy Cloud couldn't read this invitation.",
            };
        },
        async inviteAccept(token) {
            const answer = await accountsCall(
                "POST",
                "v1/invites/accept",
                { token },
                (status, json): HappyCloudInviteAcceptResult => {
                    if (status === 410) return inviteClosedRead(json);
                    if (
                        status === 403 &&
                        json.code === "email_mismatch" &&
                        typeof json.emailHint === "string"
                    )
                        return { kind: "emailMismatch", emailHint: json.emailHint };
                    const server = status === 200 ? serverSeen(json.server, seen) : undefined;
                    if (server)
                        return { kind: "joined", server: { id: server.id, name: server.name } };
                    return {
                        kind: "failed",
                        message:
                            status >= 500
                                ? UNREACHABLE.message
                                : "Happy Cloud couldn't accept this invitation.",
                    };
                },
            );
            if (!("ok" in answer)) return answer;
            return answer.code === SIGN_IN_REQUIRED.code
                ? { kind: "signInRequired" }
                : { kind: "failed", message: answer.message };
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

const INVITE_CLOSED_CODES: readonly HappyCloudInviteClosedCode[] = [
    "invalid",
    "expired",
    "revoked",
    "exhausted",
    "accepted",
];
/** The longest picture an invitation may carry inline, as a `data:` URL. */
const INVITE_IMAGE_LENGTH_MAX = 2 * 1024 * 1024;

/** Why Happy Cloud will not take an invitation; a reason it does not name reads as invalid. */
function inviteClosedRead(json: Record<string, unknown>): {
    readonly kind: "closed";
    readonly code: HappyCloudInviteClosedCode;
    readonly detail: string;
} {
    return {
        kind: "closed",
        code: INVITE_CLOSED_CODES.find((code) => code === json.code) ?? "invalid",
        detail:
            typeof json.error === "string" && json.error !== ""
                ? json.error
                : "This invitation can't be used.",
    };
}

/**
 * An invitation as the account API describes it, or nothing for an answer
 * that is not one. A picture is taken only as inline image data: this answer
 * needs no account, so nothing in it is ever fetched.
 */
function invitePreviewRead(json: Record<string, unknown>): HappyCloudInvitePreview | undefined {
    const text = (value: unknown): string | undefined =>
        typeof value === "string" && value.trim() !== "" ? value : undefined;
    const image = (value: unknown): string | undefined =>
        typeof value === "string" &&
        value.length <= INVITE_IMAGE_LENGTH_MAX &&
        /^data:image\/(?:png|jpeg|webp|gif);base64,/u.test(value)
            ? value
            : undefined;
    const record = (value: unknown): Record<string, unknown> | undefined =>
        typeof value === "object" && value !== null
            ? (value as Record<string, unknown>)
            : undefined;
    const server = record(json.server);
    const roleName = text(json.roleName);
    if (
        typeof server?.name !== "string" ||
        !happyCloudServerNameValid(server.name) ||
        roleName === undefined ||
        typeof json.expiresAt !== "string" ||
        Number.isNaN(Date.parse(json.expiresAt))
    )
        return undefined;
    const displayName = text(server.displayName);
    const serverImage = image(server.image);
    const inviter = record(json.inviter);
    const inviterName = text(inviter?.name);
    const inviterImage = image(inviter?.image);
    return {
        server: {
            name: server.name,
            ...(displayName === undefined ? {} : { displayName }),
            ...(serverImage === undefined ? {} : { image: serverImage }),
        },
        ...(inviter
            ? {
                  inviter: {
                      ...(inviterName === undefined ? {} : { name: inviterName }),
                      ...(inviterImage === undefined ? {} : { image: inviterImage }),
                  },
              }
            : {}),
        roleName,
        expiresAt: json.expiresAt,
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
 * The server tokens the account API issued for `serverUrl`. They refresh at
 * the account API with no account token, for that server alone.
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
        refreshUrl: new URL("token", HAPPY_CLOUD_API_URL).href,
        clientId: "happy",
        resource: serverUrl,
        serverUrl,
    };
}

/** A server's picture address, only when it is on the account API's origin the token belongs to. */
function imageUrlRead(value: unknown): string | undefined {
    const image = (value as { readonly image?: { readonly url?: unknown } | null }).image;
    if (typeof image?.url !== "string") return undefined;
    try {
        const url = new URL(image.url, HAPPY_CLOUD_API_URL);
        return url.origin === new URL(HAPPY_CLOUD_API_URL).origin ? url.href : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Whether an identity token was issued to this app (`aud` names `happy`).
 * It is not verified here; the cluster verifies it, and this only keeps a
 * token meant for another app from being sent on.
 */
function identityTokenForApp(token: string): boolean {
    try {
        const claims = JSON.parse(
            Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
        ) as { readonly aud?: unknown };
        const audiences = typeof claims.aud === "string" ? [claims.aud] : claims.aud;
        return Array.isArray(audiences) && audiences.includes("happy");
    } catch {
        return false;
    }
}
