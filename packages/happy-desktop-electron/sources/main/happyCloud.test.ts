import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beginOAuthSignIn } from "@slopus/happy-agent-client";
import { expect, it, vi } from "vitest";
import {
    HAPPY_CLOUD_ACCOUNT_ID,
    HAPPY_CLOUD_API_URL,
    HAPPY_CLOUD_IDENTITY_URL,
} from "../shared/happyCloud";
import { happyCloudCreate } from "./happyCloud";
import { fakeHappyCloudAccountCreate } from "../testing/fakeHappyCloudAccount";
import type { ServerSessions } from "./serverSessions";

/*
 * The account signs in at the identity provider alone, which answers with an
 * identity token; the cluster's account API trades it for the account's
 * session, which is what is held. Refusals are worded for the person.
 */

const jwt = (claims: Record<string, unknown>) =>
    `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const ID_TOKEN = jwt({ aud: "happy", sub: "account" });
const SESSION = {
    access_token: jwt({ aud: HAPPY_CLOUD_API_URL }),
    refresh_token: "account-refresh",
    expires_in: 3600,
};

/** Answers each request by its address; the identity provider's unless routed. */
function cloudCreate(
    identity: (url: URL) => Response,
    api: (url: URL, init?: RequestInit) => Response = () => Response.json(SESSION),
) {
    const directSignIn = vi.fn();
    const directSignOut = vi.fn((): string | null => "account-refresh");
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        return url.origin === new URL(HAPPY_CLOUD_API_URL).origin ? api(url, init) : identity(url);
    });
    const cloud = happyCloudCreate({
        listPath: join(mkdtempSync(join(tmpdir(), "happy-cloud-")), "servers.json"),
        fetch: fetch as unknown as typeof globalThis.fetch,
        sessions: () =>
            ({
                directSignIn,
                directSignOut,
                directChanged: () => undefined,
                credential: () => ({ accessToken: SESSION.access_token }),
            }) as unknown as ServerSessions,
    });
    return { cloud, directSignIn, directSignOut, fetch };
}

const sessionHeld = expect.objectContaining({
    accessToken: SESSION.access_token,
    refreshToken: "account-refresh",
    refreshUrl: null,
    clientId: "happy",
    serverUrl: HAPPY_CLOUD_API_URL,
});

it("trades a test sign-in's identity token for the account's session", async () => {
    const { cloud, directSignIn, fetch } = cloudCreate(() =>
        Response.json({ id_token: ID_TOKEN, expires_in: 300 }),
    );
    expect(await cloud.passwordSignIn("qa-desktop", "secret")).toEqual({
        ok: true,
        value: undefined,
    });
    expect(fetch.mock.calls.map(([url, init]) => [String(url), init?.body])).toEqual([
        [
            "https://auth.happy.engineering/v2/auth/password",
            JSON.stringify({ login: "qa-desktop", password: "secret" }),
        ],
        ["https://api.happy-clusters.com/v1/session", JSON.stringify({ id_token: ID_TOKEN })],
    ]);
    expect(directSignIn).toHaveBeenCalledWith(HAPPY_CLOUD_ACCOUNT_ID, sessionHeld);
});

it("never sends on an identity token issued to another app", async () => {
    const { cloud, directSignIn, fetch } = cloudCreate(() =>
        Response.json({ id_token: jwt({ aud: "happy-web" }), expires_in: 300 }),
    );
    expect(await cloud.passwordSignIn("qa", "secret")).toMatchObject({
        ok: false,
        code: "invalid_token",
        message: "Signing in didn't work.",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(directSignIn).not.toHaveBeenCalled();
});

it("says what the cluster said when it refuses the identity token", async () => {
    const { cloud, directSignIn } = cloudCreate(
        () => Response.json({ id_token: ID_TOKEN, expires_in: 300 }),
        () =>
            Response.json(
                { code: "invalid_token", error: "That sign-in expired." },
                { status: 401 },
            ),
    );
    expect(await cloud.passwordSignIn("qa", "secret")).toEqual({
        ok: false,
        code: "invalid_token",
        message: "That sign-in expired.",
    });
    expect(directSignIn).not.toHaveBeenCalled();
});

it("completes a browser sign-in with the session the identity token is traded for", async () => {
    const { cloud, fetch } = cloudCreate(() =>
        Response.json({ id_token: ID_TOKEN, token_type: "Bearer", expires_in: 300 }),
    );
    const account = cloud.direct.account;
    expect(account.serverUrl).toBe(HAPPY_CLOUD_API_URL);
    const signIn = await beginOAuthSignIn(account.method, {
        redirectUri: "happy://oauth/callback",
        serverUrl: account.serverUrl,
    });
    const authorize = new URL(signIn.url);
    expect(`${authorize.origin}${authorize.pathname}`).toBe(
        "https://auth.happy.engineering/authorize",
    );
    expect(authorize.searchParams.get("scope")).toBe("openid");
    expect(authorize.searchParams.has("resource")).toBe(false);
    const credential = await account.signInComplete(
        signIn,
        `happy://oauth/callback?code=c&state=${signIn.state}`,
    );
    expect(credential).toMatchObject({
        accessToken: SESSION.access_token,
        refreshToken: "account-refresh",
        serverUrl: HAPPY_CLOUD_API_URL,
    });
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
        "https://auth.happy.engineering/token",
        "https://api.happy-clusters.com/v1/session",
    ]);
});

it("revokes the account's session at the account API when signing out", async () => {
    const { cloud, directSignOut, fetch } = cloudCreate(() => new Response("", { status: 404 }));
    cloud.accountSignOut();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(directSignOut).toHaveBeenCalledWith(HAPPY_CLOUD_ACCOUNT_ID);
    expect(String(fetch.mock.calls[0]![0])).toBe("https://api.happy-clusters.com/revoke");
    expect(String(fetch.mock.calls[0]![1]?.body)).toBe("token=account-refresh&client_id=happy");
});

it("lists servers and signs in to one at the account API", async () => {
    const { cloud, directSignIn, fetch } = cloudCreate(
        () => new Response("", { status: 404 }),
        (url) =>
            url.pathname === "/v1/servers"
                ? Response.json({ servers: [{ id: "s1", name: "acme" }] })
                : Response.json({
                      access_token: "server-access",
                      refresh_token: "server-refresh",
                      expires_in: 900,
                  }),
    );
    expect(await cloud.serversList()).toMatchObject({
        ok: true,
        value: [{ id: "s1", name: "acme" }],
    });
    expect(await cloud.serverConnect("s1")).toEqual({ ok: true, value: "cloud-acme" });
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
        "https://api.happy-clusters.com/v1/servers",
        "https://api.happy-clusters.com/v1/servers/s1/token",
    ]);
    expect(directSignIn).toHaveBeenCalledWith(
        "cloud-acme",
        expect.objectContaining({
            accessToken: "server-access",
            refreshToken: "server-refresh",
            refreshUrl: "https://api.happy-clusters.com/token",
            resource: "https://acme.happy-clusters.com/",
            serverUrl: "https://acme.happy-clusters.com/",
        }),
    );
});

it("words a wrong login and a lockout", async () => {
    const wrong = cloudCreate(() =>
        Response.json({ code: "invalid_credentials" }, { status: 401 }),
    );
    expect(await wrong.cloud.passwordSignIn("qa", "x")).toMatchObject({
        ok: false,
        message: "That login or password is wrong.",
    });
    const locked = cloudCreate(() =>
        Response.json({ code: "locked", retryAfter: 290 }, { status: 429 }),
    );
    expect(await locked.cloud.passwordSignIn("qa", "x")).toMatchObject({
        ok: false,
        message: "Too many tries. Try again in 5 min.",
    });
    expect(wrong.directSignIn).not.toHaveBeenCalled();
});

/*
 * Email-code sign-in asks the identity provider to send a code, then trades
 * the code for an identity token, held like a test sign-in's. Every refusal
 * is worded for the person; too many tries says how long to wait.
 */

it("asks the identity provider to email a code", async () => {
    const { cloud, directSignIn, fetch } = cloudCreate(() => new Response("{}", { status: 202 }));
    expect(await cloud.emailCodeStart("steve@example.com")).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
        new URL("v2/auth/email/start", HAPPY_CLOUD_IDENTITY_URL),
        expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ email: "steve@example.com" }),
            redirect: "error",
        }),
    );
    expect(directSignIn).not.toHaveBeenCalled();
});

it("holds the account session an emailed code's identity token is traded for", async () => {
    const { cloud, directSignIn, fetch } = cloudCreate(() =>
        Response.json({ id_token: ID_TOKEN, expires_in: 300 }),
    );
    expect(await cloud.emailCodeVerify("steve@example.com", "123456")).toEqual({ ok: true });
    expect(fetch.mock.calls.map(([url, init]) => [String(url), init?.body])).toEqual([
        [
            "https://auth.happy.engineering/v2/auth/email/verify",
            JSON.stringify({ email: "steve@example.com", code: "123456" }),
        ],
        ["https://api.happy-clusters.com/v1/session", JSON.stringify({ id_token: ID_TOKEN })],
    ]);
    expect(directSignIn).toHaveBeenCalledWith(HAPPY_CLOUD_ACCOUNT_ID, sessionHeld);
});

it("refuses a verify answer that carries no identity token", async () => {
    const { cloud, directSignIn, fetch } = cloudCreate(() => Response.json({}));
    expect(await cloud.emailCodeVerify("steve@example.com", "123456")).toMatchObject({
        ok: false,
        message: "Signing in didn't work.",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(directSignIn).not.toHaveBeenCalled();
});

it.each([
    ["start", 400, "invalid_email", "Email is invalid.", "That email address doesn't look right."],
    ["verify", 400, "invalid_code", "Code is invalid.", "That code is wrong or has expired."],
    [
        "start",
        502,
        "unavailable",
        "WorkOS is down.",
        "Happy Cloud couldn't send a code right now. Try again.",
    ],
    [
        "verify",
        502,
        "unavailable",
        "WorkOS is down.",
        "Happy Cloud couldn't check the code right now. Try again.",
    ],
    [
        "start",
        400,
        "unsupported_provider",
        "Email sign-in is not configured on this server.",
        "Email sign-in is not configured on this server.",
    ],
    ["verify", 500, "internal", "Something broke.", "Something broke."],
] as const)("words a %s refusal %i %s", async (step, status, code, error, message) => {
    const { cloud, directSignIn } = cloudCreate(() => Response.json({ code, error }, { status }));
    const answer =
        step === "start"
            ? await cloud.emailCodeStart("steve@example.com")
            : await cloud.emailCodeVerify("steve@example.com", "123456");
    expect(answer).toEqual({ ok: false, code, message });
    expect(directSignIn).not.toHaveBeenCalled();
});

it("says how long to wait after too many tries", async () => {
    const header = cloudCreate(() =>
        Response.json(
            { code: "rate_limited", error: "Slow down.", retryAfter: 30 },
            { status: 429, headers: { "retry-after": "42" } },
        ),
    );
    expect(await header.cloud.emailCodeStart("steve@example.com")).toEqual({
        ok: false,
        code: "rate_limited",
        message: "Too many tries.",
        retryAfter: 42,
    });
    const body = cloudCreate(() =>
        Response.json({ code: "rate_limited", retryAfter: 17.2 }, { status: 429 }),
    );
    expect(await body.cloud.emailCodeVerify("steve@example.com", "1")).toMatchObject({
        code: "rate_limited",
        retryAfter: 18,
    });
    const neither = cloudCreate(() => new Response("", { status: 429 }));
    expect(await neither.cloud.emailCodeStart("steve@example.com")).toMatchObject({
        code: "rate_limited",
        retryAfter: 60,
    });
});

it("says Happy Cloud is unreachable when the request fails", async () => {
    const { cloud } = cloudCreate(() => {
        throw new TypeError("fetch failed");
    });
    expect(await cloud.emailCodeStart("steve@example.com")).toEqual({
        ok: false,
        code: "remote_unavailable",
        message: "Happy Cloud isn't reachable right now.",
    });
});

/*
 * Invitations. A preview is asked with no session and no cookies; an accept
 * is asked as the account. The token goes in each request's body and nowhere
 * else, and Happy Cloud's refusals come back as what they mean.
 */

const INVITE = "q3T9vYk2mLx8RfA0pWn4cZs7HbE1uJd6GoV5iNy_-Xt";
const PICTURE = "data:image/png;base64,iVBORw0KGgo=";

/** The shell against the fake account API, signed in as `email` unless told otherwise. */
function inviteCloudCreate(email: string | null = "steve@acme.com") {
    const account = fakeHappyCloudAccountCreate();
    account.serverAdd({ id: "s1", name: "acme", displayName: "Acme Corp", image: PICTURE });
    let accessToken = email === null ? undefined : account.sessionOpen(email);
    const directSignIn = vi.fn();
    const signInRequire = vi.fn(() => {
        accessToken = undefined;
    });
    const cloud = happyCloudCreate({
        listPath: join(mkdtempSync(join(tmpdir(), "happy-cloud-")), "servers.json"),
        fetch: account.fetch,
        sessions: () =>
            ({
                directSignIn,
                directChanged: () => undefined,
                signInRequire,
                credential: () => (accessToken === undefined ? undefined : { accessToken }),
            }) as unknown as ServerSessions,
    });
    return { account, cloud, directSignIn, signInRequire, accessToken: () => accessToken };
}

it("previews an invitation with no session and no cookies", async () => {
    const { account, cloud } = inviteCloudCreate();
    account.inviteAdd({
        token: INVITE,
        serverId: "s1",
        roleName: "Member",
        inviter: { name: "Steve", image: PICTURE },
        expiresAt: "2099-12-05T18:00:00.000Z",
    });
    expect(await cloud.invitePreview(INVITE)).toEqual({
        kind: "invite",
        invite: {
            server: { name: "acme", displayName: "Acme Corp", image: PICTURE },
            inviter: { name: "Steve", image: PICTURE },
            roleName: "Member",
            expiresAt: "2099-12-05T18:00:00.000Z",
        },
    });
    expect(account.requests).toEqual([
        {
            method: "POST",
            url: "https://api.happy-clusters.com/v1/invites/preview",
            path: "/v1/invites/preview",
            credentials: "omit",
            body: JSON.stringify({ token: INVITE }),
        },
    ]);
});

it("reads an invitation with no inviter, no display name and no picture", async () => {
    const { account, cloud } = inviteCloudCreate(null);
    account.serverAdd({ id: "s2", name: "guild" });
    account.inviteAdd({ token: INVITE, serverId: "s2", roleName: "Admin" });
    expect(await cloud.invitePreview(INVITE)).toEqual({
        kind: "invite",
        invite: {
            server: { name: "guild" },
            roleName: "Admin",
            expiresAt: expect.any(String),
        },
    });
});

it("takes a preview's pictures only as inline image data", async () => {
    const preview = (server: unknown, inviter: unknown) =>
        cloudCreate(
            () => new Response("", { status: 404 }),
            () =>
                Response.json({
                    server,
                    inviter,
                    roleName: "Member",
                    expiresAt: "2099-12-05T18:00:00Z",
                }),
        ).cloud.invitePreview(INVITE);
    // An address to fetch, a script, or a page is never a picture.
    expect(
        await preview(
            { name: "acme", displayName: null, image: "https://example.com/tracker.png" },
            { name: null, image: "data:text/html;base64,PGI+" },
        ),
    ).toEqual({
        kind: "invite",
        invite: {
            server: { name: "acme" },
            inviter: {},
            roleName: "Member",
            expiresAt: "2099-12-05T18:00:00Z",
        },
    });
    // An answer that names no server this app could hold is not an invitation.
    for (const server of [null, { name: "Not A Name" }, { name: 7 }])
        expect(await preview(server, null)).toEqual({
            kind: "failed",
            message: "Happy Cloud couldn't read this invitation.",
        });
});

it("says why Happy Cloud will not take an invitation", async () => {
    const { account, cloud } = inviteCloudCreate();
    expect(await cloud.invitePreview(INVITE)).toEqual({
        kind: "closed",
        code: "invalid",
        detail: "This invitation link isn't valid.",
    });
    account.inviteAdd({ token: INVITE, serverId: "s1", roleName: "Member" });
    account.inviteRevoke(INVITE);
    const revoked = { kind: "closed", code: "revoked", detail: "This invitation was revoked." };
    expect(await cloud.invitePreview(INVITE)).toEqual(revoked);
    expect(await cloud.inviteAccept(INVITE)).toEqual(revoked);
    account.inviteAdd({
        token: INVITE,
        serverId: "s1",
        roleName: "Member",
        expiresAt: "2020-01-01T00:00:00Z",
    });
    expect(await cloud.invitePreview(INVITE)).toMatchObject({ kind: "closed", code: "expired" });
    // A reason this app does not know reads as invalid, with the sentence given.
    const unknown = cloudCreate(
        () => new Response("", { status: 404 }),
        () => Response.json({ code: "paused", error: "Invitations are paused." }, { status: 410 }),
    );
    expect(await unknown.cloud.invitePreview(INVITE)).toEqual({
        kind: "closed",
        code: "invalid",
        detail: "Invitations are paused.",
    });
});

it("accepts an invitation as the account, after which the server is one of its own", async () => {
    const { account, cloud, directSignIn, accessToken } = inviteCloudCreate();
    account.inviteAdd({ token: INVITE, serverId: "s1", roleName: "Member" });
    // Not one of the account's until the invitation is accepted.
    expect(await cloud.serverConnect("s1")).toMatchObject({ ok: false, code: "not_found" });
    expect(await cloud.inviteAccept(INVITE)).toEqual({
        kind: "joined",
        server: { id: "s1", name: "acme" },
    });
    expect(account.requests.at(-1)).toEqual({
        method: "POST",
        url: "https://api.happy-clusters.com/v1/invites/accept",
        path: "/v1/invites/accept",
        authorization: `Bearer ${String(accessToken())}`,
        body: JSON.stringify({ token: INVITE }),
    });
    expect(await cloud.serverConnect("s1")).toEqual({ ok: true, value: "cloud-acme" });
    expect(directSignIn).toHaveBeenCalledWith(
        "cloud-acme",
        expect.objectContaining({ accessToken: "server-access-s1" }),
    );
    // Accepting again while the link still stands changes nothing and is not refused.
    expect(await cloud.inviteAccept(INVITE)).toMatchObject({ kind: "joined" });
    // The token was in two bodies and in no address.
    for (const request of account.requests) expect(request.url).not.toContain(INVITE);
});

it("says which address an email invitation was sent to", async () => {
    const { account, cloud } = inviteCloudCreate("other@example.com");
    account.inviteAdd({
        token: INVITE,
        serverId: "s1",
        roleName: "Member",
        email: "steve@acme.com",
    });
    expect(await cloud.inviteAccept(INVITE)).toEqual({
        kind: "emailMismatch",
        emailHint: "s•••@acme.com",
    });
    // The invitation still stands for the address it was sent to, once.
    const invited = inviteCloudCreate("steve@acme.com");
    invited.account.inviteAdd({
        token: INVITE,
        serverId: "s1",
        roleName: "Member",
        email: "steve@acme.com",
    });
    expect(await invited.cloud.inviteAccept(INVITE)).toMatchObject({ kind: "joined" });
    expect(await invited.cloud.inviteAccept(INVITE)).toMatchObject({
        kind: "closed",
        code: "accepted",
    });
});

it("asks for a sign-in when the account has no session, or one Happy Cloud refuses", async () => {
    const signedOut = inviteCloudCreate(null);
    signedOut.account.inviteAdd({ token: INVITE, serverId: "s1", roleName: "Member" });
    expect(await signedOut.cloud.inviteAccept(INVITE)).toEqual({ kind: "signInRequired" });
    // Nothing was sent: there was no one to send it as.
    expect(signedOut.account.requests).toEqual([]);

    const ended = inviteCloudCreate();
    ended.account.inviteAdd({ token: INVITE, serverId: "s1", roleName: "Member" });
    const held = String(ended.accessToken());
    ended.account.sessionEnd(held);
    expect(await ended.cloud.inviteAccept(INVITE)).toEqual({ kind: "signInRequired" });
    expect(ended.signInRequire).toHaveBeenCalledWith(HAPPY_CLOUD_ACCOUNT_ID, held);
});

it("fails an invitation's preview and accept when Happy Cloud cannot be reached", async () => {
    const { account, cloud } = inviteCloudCreate();
    account.inviteAdd({ token: INVITE, serverId: "s1", roleName: "Member" });
    const unreachable = { kind: "failed", message: "Happy Cloud isn't reachable right now." };
    account.offline = true;
    expect(await cloud.invitePreview(INVITE)).toEqual(unreachable);
    expect(await cloud.inviteAccept(INVITE)).toEqual(unreachable);
    account.offline = false;
    account.failing = true;
    expect(await cloud.invitePreview(INVITE)).toEqual(unreachable);
    expect(await cloud.inviteAccept(INVITE)).toEqual(unreachable);
    account.failing = false;
    // Neither failure spent or closed anything.
    expect(await cloud.inviteAccept(INVITE)).toMatchObject({ kind: "joined" });
});
