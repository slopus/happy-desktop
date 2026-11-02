import { afterEach, expect, it, vi } from "vitest";
import { serverSessionsCreate, type ServerSessionsDeps } from "./serverSessions";

/*
 * Team-server sign-ins live in main's memory only. These drive the whole
 * exchange against a fake server and authorization server: discovery read
 * from the server itself, the browser's callback matched by state, one
 * refresh at a time, and a rejected refresh ending the sign-in.
 */

const URL_BASE = "https://happy.example.com/";

afterEach(() => {
    vi.useRealTimers();
});

function serverCreate(options: { readonly refreshRefused?: boolean } = {}) {
    let issued = 0;
    const tokenRequests: Record<string, string>[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.href === `${URL_BASE}v0/authentication`)
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
            issued += 1;
            return Response.json({
                access_token: `access-${String(issued)}`,
                token_type: "Bearer",
                expires_in: 3600,
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
    const sessions = serverSessionsCreate({
        connectionUrl: async (id) => (id === "team" ? URL_BASE : undefined),
        fetch: server.fetch,
        async browserOpen(url) {
            opened.push(url);
        },
        async healthRead(id) {
            healthReads.push(id);
        },
        ...extra,
    });
    return { sessions, opened, healthReads };
}

async function signedIn(sessions: ReturnType<typeof sessionsCreate>) {
    const { attemptId } = await sessions.sessions.signInBegin("team");
    const state = new URL(sessions.opened.at(-1)!).searchParams.get("state");
    const finished = sessions.sessions.signInFinish(attemptId);
    expect(sessions.sessions.callbackReceive(`happy://oauth/callback?code=c&state=${state}`)).toBe(
        true,
    );
    await finished;
}

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
    expect(context.sessions.token("team")).toBe("access-1");
    expect(context.sessions.tokens()).toEqual({ team: "access-1" });
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
    expect(context.sessions.token("team")).toBeUndefined();
});

it("refreshes once for many refusals, and hands a newer token to a caller that is behind", async () => {
    const server = serverCreate();
    const context = sessionsCreate(server);
    await signedIn(context);
    const [first, second] = await Promise.all([
        context.sessions.refresh("team", "access-1"),
        context.sessions.refresh("team", "access-1"),
    ]);
    expect([first, second]).toEqual(["access-2", "access-2"]);
    expect(server.tokenRequests.filter((form) => form.grant_type === "refresh_token")).toHaveLength(
        1,
    );
    expect(await context.sessions.refresh("team", "access-1")).toBe("access-2");
});

it("ends the sign-in when the refresh is refused, and says so", async () => {
    const context = sessionsCreate(serverCreate({ refreshRefused: true }));
    await signedIn(context);
    expect(await context.sessions.refresh("team", "access-1")).toBeUndefined();
    expect(context.sessions.token("team")).toBeUndefined();
    expect(context.sessions.get()).toEqual([
        {
            connectionId: "team",
            state: "signedOut",
            message: "Your sign-in to this server ended. Sign in again.",
        },
    ]);
});

it("refreshes a minute before the access token expires", async () => {
    vi.useFakeTimers();
    const server = serverCreate();
    const context = sessionsCreate(server);
    await signedIn(context);
    await vi.advanceTimersByTimeAsync(3600_000 - 61_000);
    expect(context.sessions.token("team")).toBe("access-1");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(context.sessions.token("team")).toBe("access-2");
});

it("forgets a removed server, and a server refused again after a refresh needs a sign-in", async () => {
    const context = sessionsCreate(serverCreate());
    await signedIn(context);
    context.sessions.signInRequire("team", "stale");
    expect(context.sessions.token("team")).toBe("access-1");
    context.sessions.signInRequire("team", "access-1");
    expect(context.sessions.get()).toEqual([
        {
            connectionId: "team",
            state: "signedOut",
            message: "This server asked you to sign in again.",
        },
    ]);
    context.sessions.forget("team");
    expect(context.sessions.get()).toEqual([]);
});
