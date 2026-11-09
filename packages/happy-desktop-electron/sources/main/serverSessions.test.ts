import { afterEach, expect, it, vi } from "vitest";
import { serverSessionsCreate, type ServerSessionsDeps } from "./serverSessions";

/*
 * Team-server sign-ins live in main's memory only. These drive the whole
 * exchange against a fake server and authorization server: discovery read
 * from the server itself, the browser's callback matched by state, one
 * refresh at a time, and a rejected refresh ending the sign-in. Every sign-in
 * is bound to the address the roster named when it began, and ends when the
 * roster names another.
 */

const URL_BASE = "https://happy.example.com/";
const ELSEWHERE = "https://elsewhere.example.com/";
/** The servers the fake authorization server's tokens name by default. */
const AUDIENCE = [URL_BASE, ELSEWHERE];

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
/** The access token issued `n`th: a JWT whose `aud` names `audience`. */
function access(n: number, audience: readonly string[] = AUDIENCE): string {
    return `${base64url({ alg: "none" })}.${base64url({ aud: audience, n })}.signature`;
}

afterEach(() => {
    vi.useRealTimers();
});

function serverCreate(
    options: {
        readonly refreshRefused?: boolean;
        readonly expiresIn?: number;
        /** Holds the code exchange until the test lets it go. */
        readonly exchangeGate?: Promise<void>;
        /** The servers issued tokens name in `aud`. */
        readonly audience?: readonly string[];
        /** Issues no refresh token, as Happy Cloud's account pass. */
        readonly noRefresh?: boolean;
    } = {},
) {
    let issued = 0;
    const tokenRequests: Record<string, string>[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.pathname === "/v0/authentication")
            return Response.json({
                authenticated: false,
                userId: null,
                methods: [
                    {
                        type: "oauth",
                        id: "jwt",
                        name: "Example SSO",
                        authorizationUrl: "https://login.example.com/authorize",
                        tokenUrl: "https://login.example.com/token",
                        refreshUrl: "https://login.example.com/token",
                        clientId: "happy",
                    },
                ],
            });
        if (url.href === "https://login.example.com/token") {
            const form = Object.fromEntries(new URLSearchParams(String(init?.body)));
            tokenRequests.push(form);
            if (form.grant_type === "refresh_token" && options.refreshRefused)
                return Response.json({ error: "invalid_grant" }, { status: 400 });
            if (form.grant_type === "authorization_code") await options.exchangeGate;
            issued += 1;
            return Response.json({
                access_token: access(issued, options.audience),
                token_type: "Bearer",
                expires_in: options.expiresIn ?? 3600,
                ...(options.noRefresh ? {} : { refresh_token: `refresh-${String(issued)}` }),
            });
        }
        return new Response("not found", { status: 404 });
    });
    return { fetch: fetch as unknown as typeof globalThis.fetch, tokenRequests };
}

function sessionsCreate(
    server: ReturnType<typeof serverCreate>,
    extra?: Partial<ServerSessionsDeps>,
) {
    const opened: string[] = [];
    const healthReads: string[] = [];
    const roster = new Map([["team", URL_BASE]]);
    const sessions = serverSessionsCreate({
        roster: async () => new Map(roster),
        fetch: server.fetch,
        async browserOpen(url) {
            opened.push(url);
        },
        async healthRead(id) {
            healthReads.push(id);
        },
        ...extra,
    });
    return { sessions, opened, healthReads, roster };
}

function callbackOf(sessions: ReturnType<typeof sessionsCreate>): string {
    const state = new URL(sessions.opened.at(-1)!).searchParams.get("state");
    return `happy://oauth/callback?code=c&state=${state}`;
}

async function signedIn(sessions: ReturnType<typeof sessionsCreate>) {
    const { attemptId } = await sessions.sessions.signInBegin("team");
    const finished = sessions.sessions.signInFinish(attemptId);
    expect(sessions.sessions.callbackReceive(callbackOf(sessions))).toBe(true);
    await finished;
}

const tokenOf = (sessions: ReturnType<typeof sessionsCreate>) =>
    sessions.sessions.credential("team")?.accessToken;

it("signs in through the browser and keeps the tokens only in memory", async () => {
    const server = serverCreate();
    const context = sessionsCreate(server);
    const listener = vi.fn();
    context.sessions.subscribe(listener);
    const begun = await context.sessions.signInBegin("team");
    expect(begun.host).toBe("login.example.com");
    const authorization = new URL(context.opened[0]!);
    expect(authorization.searchParams.get("redirect_uri")).toBe("happy://oauth/callback");
    // A callback for no attempt is not this sign-in's.
    expect(context.sessions.callbackReceive("happy://oauth/callback?code=c&state=other")).toBe(
        false,
    );
    const finished = context.sessions.signInFinish(begun.attemptId);
    context.sessions.callbackReceive(
        `happy://oauth/callback?code=c&state=${authorization.searchParams.get("state")}`,
    );
    await finished;
    expect(tokenOf(context)).toBe(access(1));
    expect(context.sessions.tokens()).toEqual({
        team: { accessToken: access(1), serverUrl: URL_BASE },
    });
    expect(context.sessions.get()).toEqual([{ connectionId: "team", state: "signedIn" }]);
    expect(context.healthReads).toEqual(["team"]);
    expect(listener).toHaveBeenCalled();
    // What the window reads names no token.
    expect(JSON.stringify(context.sessions.get())).not.toContain("access");
});

it("refuses a connection the host does not list as a server added by address", async () => {
    const context = sessionsCreate(serverCreate());
    await expect(context.sessions.signInBegin("cloud")).rejects.toMatchObject({
        code: "not_found",
    });
    expect(context.opened).toEqual([]);
});

it("cancels an attempt, and a late callback then finishes nothing", async () => {
    const context = sessionsCreate(serverCreate());
    const begun = await context.sessions.signInBegin("team");
    const finished = context.sessions.signInFinish(begun.attemptId);
    context.sessions.signInCancel(begun.attemptId);
    await expect(finished).rejects.toMatchObject({ code: "cancelled" });
    const state = new URL(context.opened[0]!).searchParams.get("state");
    expect(context.sessions.callbackReceive(`happy://oauth/callback?code=c&state=${state}`)).toBe(
        false,
    );
    expect(tokenOf(context)).toBeUndefined();
});

it("refreshes once for many refusals, and hands a newer token to a caller that is behind", async () => {
    const server = serverCreate();
    const context = sessionsCreate(server);
    await signedIn(context);
    const [first, second] = await Promise.all([
        context.sessions.refresh("team", access(1)),
        context.sessions.refresh("team", access(1)),
    ]);
    expect([first?.accessToken, second?.accessToken]).toEqual([access(2), access(2)]);
    expect(server.tokenRequests.filter((form) => form.grant_type === "refresh_token")).toHaveLength(
        1,
    );
    expect((await context.sessions.refresh("team", access(1)))?.accessToken).toBe(access(2));
});

it("ends the sign-in when the refresh is refused, and says so", async () => {
    const context = sessionsCreate(serverCreate({ refreshRefused: true }));
    await signedIn(context);
    expect(await context.sessions.refresh("team", access(1))).toBeUndefined();
    expect(tokenOf(context)).toBeUndefined();
    expect(context.sessions.get()).toEqual([
        {
            connectionId: "team",
            state: "signedOut",
            message: "Your sign-in to this server ended. Sign in again.",
        },
    ]);
});

it("refreshes once four fifths of the token's lifetime have passed", async () => {
    vi.useFakeTimers();
    const server = serverCreate();
    const context = sessionsCreate(server);
    await signedIn(context);
    await vi.advanceTimersByTimeAsync(2880_000 - 1_000);
    expect(tokenOf(context)).toBe(access(1));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(tokenOf(context)).toBe(access(2));
});

it.each([60, 5])(
    "refreshes a token that lives %i seconds at a steady pace, not in a loop",
    async (expiresIn) => {
        vi.useFakeTimers();
        const server = serverCreate({ expiresIn });
        const context = sessionsCreate(server);
        await signedIn(context);
        const refreshes = () =>
            server.tokenRequests.filter((form) => form.grant_type === "refresh_token").length;
        await vi.advanceTimersByTimeAsync(100);
        expect(refreshes()).toBe(0);
        // At most one refresh per ten seconds, however short the lifetime.
        await vi.advanceTimersByTimeAsync(60_000);
        const pace = Math.floor(60_000 / Math.max(10_000, expiresIn * 800));
        expect(refreshes()).toBeLessThanOrEqual(pace + 1);
        expect(refreshes()).toBeGreaterThanOrEqual(pace - 1);
        expect(tokenOf(context)).toBe(access(refreshes() + 1));
    },
);

it("forgets a removed server, and a server refused again after a refresh needs a sign-in", async () => {
    vi.useFakeTimers();
    const context = sessionsCreate(serverCreate());
    await signedIn(context);
    context.sessions.signInRequire("team", "stale");
    expect(tokenOf(context)).toBe(access(1));
    context.sessions.signInRequire("team", access(1));
    expect(context.sessions.get()).toEqual([
        {
            connectionId: "team",
            state: "signedOut",
            message: "This server asked you to sign in again.",
        },
    ]);
    // Main reads the roster itself; a server it no longer lists is forgotten.
    context.roster.delete("team");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(context.sessions.get()).toEqual([]);
});

it("ends a sign-in, and sends its token nowhere, once the roster moves the connection", async () => {
    vi.useFakeTimers();
    const server = serverCreate();
    const context = sessionsCreate(server);
    await signedIn(context);
    context.roster.set("team", ELSEWHERE);
    // A refresh asked for after the move reaches no authorization server.
    expect(await context.sessions.refresh("team", access(1))).toBeUndefined();
    expect(server.tokenRequests.filter((form) => form.grant_type === "refresh_token")).toEqual([]);
    expect(tokenOf(context)).toBeUndefined();
    expect(context.sessions.tokens()).toEqual({});
    expect(context.sessions.get()).toEqual([
        {
            connectionId: "team",
            state: "signedOut",
            message: "This server's address changed. Sign in again.",
        },
    ]);

    // Signed in again at the new address, a report about the old one ends nothing.
    await signedIn(context);
    expect(context.sessions.credential("team")).toEqual({
        accessToken: access(2),
        serverUrl: ELSEWHERE,
    });
    context.sessions.serverMoved("team", URL_BASE);
    expect(tokenOf(context)).toBe(access(2));
    // The roster watch alone ends it when the address changes again.
    context.roster.set("team", URL_BASE);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(tokenOf(context)).toBeUndefined();
});

it("fails a sign-in whose server moved before the browser came back", async () => {
    vi.useFakeTimers();
    const server = serverCreate();
    const context = sessionsCreate(server);
    const begun = await context.sessions.signInBegin("team");
    const finished = context.sessions.signInFinish(begun.attemptId);
    finished.catch(() => undefined);
    context.roster.set("team", ELSEWHERE);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(finished).rejects.toMatchObject({ code: "server_moved" });
    expect(context.sessions.callbackReceive(callbackOf(context))).toBe(false);
    expect(server.tokenRequests).toEqual([]);
    expect(tokenOf(context)).toBeUndefined();
});

it("keeps no tokens from a code redeemed while the server moved", async () => {
    let release!: () => void;
    const server = serverCreate({ exchangeGate: new Promise((resolve) => (release = resolve)) });
    const context = sessionsCreate(server);
    const begun = await context.sessions.signInBegin("team");
    const finished = context.sessions.signInFinish(begun.attemptId);
    finished.catch(() => undefined);
    context.sessions.callbackReceive(callbackOf(context));
    await vi.waitFor(() => expect(server.tokenRequests).toHaveLength(1));
    context.roster.set("team", ELSEWHERE);
    release();
    await expect(finished).rejects.toMatchObject({ code: "server_moved" });
    expect(tokenOf(context)).toBeUndefined();
    expect(context.sessions.get()).toEqual([]);
});

it("keeps no tokens from a code redeemed after the sign-in was cancelled", async () => {
    let release!: () => void;
    const server = serverCreate({ exchangeGate: new Promise((resolve) => (release = resolve)) });
    const context = sessionsCreate(server);
    const begun = await context.sessions.signInBegin("team");
    const finished = context.sessions.signInFinish(begun.attemptId);
    finished.catch(() => undefined);
    expect(context.sessions.callbackReceive(callbackOf(context))).toBe(true);
    // The same callback again finishes nothing more.
    expect(context.sessions.callbackReceive(callbackOf(context))).toBe(false);
    await vi.waitFor(() => expect(server.tokenRequests).toHaveLength(1));
    context.sessions.signInCancel(begun.attemptId);
    // Cancelling answers at once, without waiting for the exchange.
    await expect(finished).rejects.toMatchObject({ code: "cancelled" });
    release();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(tokenOf(context)).toBeUndefined();
    expect(context.sessions.get()).toEqual([]);
    expect(context.healthReads).toEqual([]);
});

it("hands a finished sign-in to a finish call that arrives after it", async () => {
    vi.useFakeTimers();
    const server = serverCreate();
    const context = sessionsCreate(server, {
        // The browser comes back before the window hears the attempt began.
        async browserOpen(url) {
            context.opened.push(url);
            context.sessions.callbackReceive(callbackOf(context));
            await vi.waitFor(() => expect(tokenOf(context)).toBe(access(1)));
        },
    });
    const begun = await context.sessions.signInBegin("team");
    await context.sessions.signInFinish(begun.attemptId);
    // Taken once; a later call finds nothing open.
    await expect(context.sessions.signInFinish(begun.attemptId)).rejects.toMatchObject({
        code: "sign_in_expired",
    });

    // A cancelled attempt says so to a late finish, and its outcome is not kept for long.
    const second = await context.sessions.signInBegin("team");
    context.sessions.signInCancel(second.attemptId);
    await expect(context.sessions.signInFinish(second.attemptId)).rejects.toMatchObject({
        code: "cancelled",
    });
    const third = await context.sessions.signInBegin("team");
    context.sessions.signInCancel(third.attemptId);
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(context.sessions.signInFinish(third.attemptId)).rejects.toMatchObject({
        code: "sign_in_expired",
    });
});

it("keeps no token that names another server, and refuses a token URL on another origin", async () => {
    const server = serverCreate({ audience: ["https://real-deployment.example.com/"] });
    const context = sessionsCreate(server);
    const begun = await context.sessions.signInBegin("team");
    const finished = context.sessions.signInFinish(begun.attemptId);
    finished.catch(() => undefined);
    context.sessions.callbackReceive(callbackOf(context));
    await expect(finished).rejects.toMatchObject({ code: "audience_mismatch" });
    expect(tokenOf(context)).toBeUndefined();

    const stealing = sessionsCreate(serverCreate(), {
        fetch: (async (input: RequestInfo | URL) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.pathname !== "/v0/authentication")
                return new Response("not found", { status: 404 });
            return Response.json({
                authenticated: false,
                userId: null,
                methods: [
                    {
                        type: "oauth",
                        id: "jwt",
                        name: "Example SSO",
                        authorizationUrl: "https://login.example.com/authorize",
                        tokenUrl: "https://attacker.example.net/token",
                        clientId: "happy",
                    },
                ],
            });
        }) as typeof globalThis.fetch,
    });
    await expect(stealing.sessions.signInBegin("team")).rejects.toMatchObject({
        code: "sign_in_unavailable",
    });
    expect(stealing.opened).toEqual([]);
});

const ACCOUNTS = "https://accounts.example.com/";
const CLOUD_SERVER = "https://acme.example.com/";

function cloudCreate(server: ReturnType<typeof serverCreate>) {
    return sessionsCreate(server, {
        direct: {
            servers: () => new Map([["cloud-acme", CLOUD_SERVER]]),
            account: {
                connectionId: "account",
                serverUrl: ACCOUNTS,
                method: {
                    type: "oauth",
                    id: "happy-cloud",
                    name: "Happy Cloud",
                    authorizationUrl: "https://login.example.com/authorize",
                    tokenUrl: "https://login.example.com/token",
                    clientId: "happy",
                    resource: ACCOUNTS,
                },
            },
        },
    });
}

it("lets Happy Cloud's account pass expire without ever refreshing it", async () => {
    vi.useFakeTimers();
    const server = serverCreate({ audience: [ACCOUNTS], noRefresh: true });
    const context = cloudCreate(server);
    const { attemptId } = await context.sessions.signInBegin("account");
    const finished = context.sessions.signInFinish(attemptId);
    context.sessions.callbackReceive(callbackOf(context));
    await finished;
    expect(context.sessions.credential("account")?.accessToken).toBe(access(1, [ACCOUNTS]));
    // The pass is never handed to the transport nor listed.
    expect(context.sessions.tokens()).toEqual({});
    expect(await context.sessions.refresh("account", "another")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(3600_000 + 1_000);
    expect(context.sessions.credential("account")).toBeUndefined();
    expect(server.tokenRequests.filter((form) => form.grant_type === "refresh_token")).toEqual([]);
});

it("ends Happy Cloud's account pass when the accounts service refuses it", async () => {
    const server = serverCreate({ audience: [ACCOUNTS], noRefresh: true });
    const context = cloudCreate(server);
    const { attemptId } = await context.sessions.signInBegin("account");
    const finished = context.sessions.signInFinish(attemptId);
    context.sessions.callbackReceive(callbackOf(context));
    await finished;
    expect(await context.sessions.refresh("account", access(1, [ACCOUNTS]))).toBeUndefined();
    expect(context.sessions.credential("account")).toBeUndefined();
    expect(server.tokenRequests.filter((form) => form.grant_type === "refresh_token")).toEqual([]);
});

it("holds a Happy Cloud server's issued tokens and refreshes them without the account", async () => {
    const server = serverCreate({ audience: [CLOUD_SERVER] });
    const context = cloudCreate(server);
    expect(() =>
        context.sessions.directSignIn("cloud-acme", {
            accessToken: "elsewhere",
            expiresAt: null,
            refreshToken: null,
            refreshUrl: null,
            clientId: "happy",
            serverUrl: "https://other.example.com/",
        }),
    ).toThrow("This sign-in is for a different server.");
    context.sessions.directSignIn("cloud-acme", {
        accessToken: "issued",
        expiresAt: Date.now() + 900_000,
        refreshToken: "refresh-issued",
        refreshUrl: "https://login.example.com/token",
        clientId: "happy",
        resource: CLOUD_SERVER,
        serverUrl: CLOUD_SERVER,
    });
    expect(context.sessions.get()).toEqual([{ connectionId: "cloud-acme", state: "signedIn" }]);
    expect(context.sessions.tokens()).toEqual({
        "cloud-acme": { accessToken: "issued", serverUrl: CLOUD_SERVER },
    });
    expect((await context.sessions.refresh("cloud-acme", "issued"))?.accessToken).toBe(
        access(1, [CLOUD_SERVER]),
    );
    expect(server.tokenRequests).toEqual([
        expect.objectContaining({
            grant_type: "refresh_token",
            refresh_token: "refresh-issued",
            resource: CLOUD_SERVER,
        }),
    ]);
});

it("keeps a Happy Cloud sign-in when the host reports a roster miss for it", () => {
    const context = cloudCreate(serverCreate());
    context.sessions.directSignIn("cloud-acme", {
        accessToken: "issued",
        expiresAt: Date.now() + 900_000,
        refreshToken: null,
        refreshUrl: null,
        clientId: "happy",
        resource: CLOUD_SERVER,
        serverUrl: CLOUD_SERVER,
    });
    context.sessions.serverMoved("cloud-acme", CLOUD_SERVER);
    expect(context.sessions.get()).toEqual([{ connectionId: "cloud-acme", state: "signedIn" }]);
    expect(context.sessions.tokens()).toEqual({
        "cloud-acme": { accessToken: "issued", serverUrl: CLOUD_SERVER },
    });
});

it("holds Happy Cloud's account pass issued without a browser", () => {
    const context = cloudCreate(serverCreate());
    context.sessions.directSignIn("account", {
        accessToken: "pass",
        expiresAt: Date.now() + 3600_000,
        refreshToken: null,
        refreshUrl: null,
        clientId: "happy",
        resource: ACCOUNTS,
        serverUrl: ACCOUNTS,
    });
    expect(context.sessions.credential("account")?.accessToken).toBe("pass");
    // The pass is never listed, nor handed to the transport.
    expect(context.sessions.get()).toEqual([{ connectionId: "cloud-acme", state: "signedOut" }]);
    expect(context.sessions.tokens()).toEqual({});
});
