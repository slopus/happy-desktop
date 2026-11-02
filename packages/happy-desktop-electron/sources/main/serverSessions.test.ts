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

afterEach(() => {
    vi.useRealTimers();
});

function serverCreate(
    options: {
        readonly refreshRefused?: boolean;
        readonly expiresIn?: number;
        /** Holds the code exchange until the test lets it go. */
        readonly exchangeGate?: Promise<void>;
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
                access_token: `access-${String(issued)}`,
                token_type: "Bearer",
                expires_in: options.expiresIn ?? 3600,
                refresh_token: `refresh-${String(issued)}`,
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
    expect(tokenOf(context)).toBe("access-1");
    expect(context.sessions.tokens()).toEqual({
        team: { accessToken: "access-1", serverUrl: URL_BASE },
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
        context.sessions.refresh("team", "access-1"),
        context.sessions.refresh("team", "access-1"),
    ]);
    expect([first?.accessToken, second?.accessToken]).toEqual(["access-2", "access-2"]);
    expect(server.tokenRequests.filter((form) => form.grant_type === "refresh_token")).toHaveLength(
        1,
    );
    expect((await context.sessions.refresh("team", "access-1"))?.accessToken).toBe("access-2");
});

it("ends the sign-in when the refresh is refused, and says so", async () => {
    const context = sessionsCreate(serverCreate({ refreshRefused: true }));
    await signedIn(context);
    expect(await context.sessions.refresh("team", "access-1")).toBeUndefined();
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
    expect(tokenOf(context)).toBe("access-1");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(tokenOf(context)).toBe("access-2");
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
        expect(tokenOf(context)).toBe(`access-${String(refreshes() + 1)}`);
    },
);

it("forgets a removed server, and a server refused again after a refresh needs a sign-in", async () => {
    vi.useFakeTimers();
    const context = sessionsCreate(serverCreate());
    await signedIn(context);
    context.sessions.signInRequire("team", "stale");
    expect(tokenOf(context)).toBe("access-1");
    context.sessions.signInRequire("team", "access-1");
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
    context.roster.set("team", "https://elsewhere.example.com/");
    // A refresh asked for after the move reaches no authorization server.
    expect(await context.sessions.refresh("team", "access-1")).toBeUndefined();
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
        accessToken: "access-2",
        serverUrl: "https://elsewhere.example.com/",
    });
    context.sessions.serverMoved("team", URL_BASE);
    expect(tokenOf(context)).toBe("access-2");
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
    context.roster.set("team", "https://elsewhere.example.com/");
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
    context.roster.set("team", "https://elsewhere.example.com/");
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
            await vi.waitFor(() => expect(tokenOf(context)).toBe("access-1"));
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
