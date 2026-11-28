import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { happyCloudCreate } from "../main/happyCloud";
import { happyExternalLinkUrl } from "../main/happyLink";
import type { ServerSessions } from "../main/serverSessions";
import {
    desktopCloudInviteStoreCreate,
    desktopExternalLinkRoute,
} from "../renderer/desktopCloudInviteStore";
import type { DesktopHappyCloud, HappyDesktopBridge } from "../shared/desktopContract";
import { HAPPY_CLOUD_ACCOUNT_ID } from "../shared/happyCloud";
import { fakeHappyCloudAccountCreate } from "./fakeHappyCloudAccount";

/*
 * An invite link from the moment the system hands it to Happy until its
 * server is open: the shell takes the link as it takes any `happy://` one,
 * the window reads it and shows the invitation, and the shell asks Happy
 * Cloud, here a fake account API, on the window's behalf. The shell's side is
 * the real one; only the network and the browser are stood in for.
 */

const TOKEN = "q3T9vYk2mLx8RfA0pWn4cZs7HbE1uJd6GoV5iNy_-Xt";
const LINK = `happy://cloud/join#${TOKEN}`;

const consoles = (["log", "info", "warn", "error", "debug"] as const).map((method) => ({
    method,
    spy: vi.spyOn(console, method),
}));
beforeEach(() => {
    for (const { spy } of consoles) spy.mockClear();
});
afterEach(() => {
    // An invitation's token is never written to a log, whatever happened.
    for (const { method, spy } of consoles)
        expect(JSON.stringify(spy.mock.calls), `console.${method}`).not.toContain(TOKEN);
});

/** Happy with a Cloud-capable shell: the fake account API behind it, and a browser to sign in with. */
function happyCreate(options: { readonly invites?: false } = {}) {
    const account = fakeHappyCloudAccountCreate();
    account.serverAdd({ id: "s1", name: "acme", displayName: "Acme Corp" });
    // The sign-ins the shell holds, by connection ID.
    const held = new Map<string, { accessToken: string; refreshToken: string | null }>();
    const sessions = {
        credential: (id: string) => held.get(id),
        directSignIn: (
            id: string,
            credential: { accessToken: string; refreshToken: string | null },
        ) => void held.set(id, credential),
        directSignOut(id: string) {
            const refreshToken = held.get(id)?.refreshToken ?? null;
            held.delete(id);
            return refreshToken;
        },
        signInRequire: (id: string) => void held.delete(id),
        directChanged: () => undefined,
    } as unknown as ServerSessions;
    const shell = happyCloudCreate({
        listPath: join(mkdtempSync(join(tmpdir(), "happy-cloud-")), "servers.json"),
        fetch: account.fetch,
        sessions: () => sessions,
    });
    const cloud = {
        serversList: () => shell.serversList(),
        serverConnect: (serverId: string) => shell.serverConnect(serverId),
        accountSignOut: async () => shell.accountSignOut(),
        ...(options.invites === false
            ? {}
            : {
                  invitePreview: (token: string) => shell.invitePreview(token),
                  inviteAccept: (token: string) => shell.inviteAccept(token),
              }),
    } as unknown as DesktopHappyCloud;

    // The system browser: a sign-in waits there until the person finishes or gives up.
    const attempts = new Map<
        string,
        (answer: { ok: true; value: null } | { ok: false; message: string; code: string }) => void
    >();
    const bridge: Pick<
        HappyDesktopBridge,
        "serverSignInBegin" | "serverSignInFinish" | "serverSignInCancel"
    > = {
        serverSignInBegin: async (connectionId) => {
            expect(connectionId).toBe(HAPPY_CLOUD_ACCOUNT_ID);
            return {
                ok: true,
                value: { attemptId: `attempt-${String(attempts.size + 1)}`, host: "auth" },
            };
        },
        serverSignInFinish: (attemptId) =>
            new Promise((resolve) => {
                attempts.set(attemptId, resolve);
            }),
        serverSignInCancel: async (attemptId) => {
            attempts.get(attemptId)?.({ ok: false, message: "Cancelled.", code: "cancelled" });
            attempts.delete(attemptId);
        },
    };
    const browser = {
        waiting: () => attempts.size,
        /** The person signs in as `email`; the shell then holds that account's session. */
        signIn(email: string) {
            const [attemptId, resolve] = [...attempts.entries()][0]!;
            attempts.delete(attemptId);
            sessions.directSignIn(HAPPY_CLOUD_ACCOUNT_ID, {
                accessToken: account.sessionOpen(email),
                refreshToken: "account-refresh",
            } as never);
            resolve({ ok: true, value: null });
        },
    };

    const inApp = new Set<string>();
    const connected: string[] = [];
    const opened: string[] = [];
    const entered = vi.fn();
    const other: string[] = [];
    const store = desktopCloudInviteStoreCreate({
        cloud,
        bridge,
        inApp: (connectionId) => inApp.has(connectionId),
        open: (connectionId) => void opened.push(connectionId),
        connect: async (connectionId) => {
            connected.push(connectionId);
            inApp.add(connectionId);
            return { ok: true };
        },
        entered,
    });
    /** The system opens Happy with `url`: the shell takes it, the window reads it. */
    const systemOpen = (url: string): boolean => {
        const taken = happyExternalLinkUrl(url);
        if (taken === undefined) return false;
        desktopExternalLinkRoute(taken, {
            cloudInvite: store.inviteOpen,
            other: (link) => void other.push(link),
        });
        return true;
    };
    return {
        account,
        sessions,
        store,
        browser,
        inApp,
        connected,
        opened,
        entered,
        other,
        systemOpen,
    };
}

const kind = (happy: ReturnType<typeof happyCreate>) => happy.store.get()?.kind;
const invite = { token: TOKEN, serverId: "s1", roleName: "Member", inviter: { name: "Steve" } };

it("opens an invite link in the app and finishes it there, signing in on the way", async () => {
    const happy = happyCreate();
    happy.account.inviteAdd(invite);
    expect(happy.systemOpen(LINK)).toBe(true);
    expect(happy.other).toEqual([]);
    await vi.waitFor(() => expect(kind(happy)).toBe("offered"));
    // The invitation is shown before any sign-in, with one request and no session.
    expect(happy.store.get()).toMatchObject({
        kind: "offered",
        signedIn: false,
        invite: {
            server: { name: "acme", displayName: "Acme Corp" },
            inviter: { name: "Steve" },
            roleName: "Member",
        },
    });
    expect(happy.account.requests.map((request) => request.path)).toEqual(["/v1/invites/preview"]);
    expect(happy.account.requests[0]!.authorization).toBeUndefined();

    happy.store.inviteSignIn();
    await vi.waitFor(() => expect(happy.browser.waiting()).toBe(1));
    expect(kind(happy)).toBe("signingIn");
    happy.browser.signIn("kirill@example.com");
    // Joined without another press, added with its own token, and open.
    await vi.waitFor(() => expect(happy.store.get()).toBeUndefined());
    expect(happy.connected).toEqual(["cloud-acme"]);
    expect(happy.sessions.credential("cloud-acme")).toMatchObject({
        accessToken: "server-access-s1",
    });
    expect(happy.entered).toHaveBeenCalledTimes(1);
    expect(happy.account.requests.map((request) => request.path)).toEqual([
        "/v1/invites/preview",
        "/v1/invites/accept",
        "/v1/servers/s1/token",
    ]);
    // The token went to the preview and the accept, in their bodies, and nowhere else.
    for (const request of happy.account.requests) {
        expect(request.url).not.toContain(TOKEN);
        expect(request.body?.includes(TOKEN) ?? false).toBe(
            request.path.startsWith("/v1/invites/"),
        );
    }
});

it("joins on one press when the account is already signed in", async () => {
    const happy = happyCreate();
    happy.account.inviteAdd(invite);
    happy.sessions.directSignIn(HAPPY_CLOUD_ACCOUNT_ID, {
        accessToken: happy.account.sessionOpen("kirill@example.com"),
        refreshToken: null,
    } as never);
    happy.systemOpen(LINK);
    await vi.waitFor(() =>
        expect(happy.store.get()).toMatchObject({ kind: "offered", signedIn: true }),
    );
    // Opening the link joined nothing.
    expect(happy.account.requests.some((request) => request.path === "/v1/invites/accept")).toBe(
        false,
    );
    happy.store.inviteJoin();
    await vi.waitFor(() => expect(happy.store.get()).toBeUndefined());
    expect(happy.connected).toEqual(["cloud-acme"]);
    expect(happy.browser.waiting()).toBe(0);
});

it("opens the server already in the app rather than adding it again", async () => {
    const happy = happyCreate();
    happy.account.inviteAdd(invite);
    happy.account.memberAdd("s1", "kirill@example.com");
    happy.inApp.add("cloud-acme");
    happy.sessions.directSignIn(HAPPY_CLOUD_ACCOUNT_ID, {
        accessToken: happy.account.sessionOpen("kirill@example.com"),
        refreshToken: null,
    } as never);
    happy.systemOpen(LINK);
    await vi.waitFor(() => expect(kind(happy)).toBe("offered"));
    expect(happy.opened).toEqual([]);
    happy.store.inviteJoin();
    await vi.waitFor(() => expect(happy.store.get()).toBeUndefined());
    expect(happy.opened).toEqual(["cloud-acme"]);
    expect(happy.connected).toEqual([]);
    expect(happy.entered).toHaveBeenCalledTimes(1);
    expect(happy.account.requests.some((request) => request.path.endsWith("/token"))).toBe(false);
});

it("closes on an email invitation opened again after it was accepted", async () => {
    const happy = happyCreate();
    happy.account.inviteAdd({ ...invite, email: "kirill@example.com" });
    happy.sessions.directSignIn(HAPPY_CLOUD_ACCOUNT_ID, {
        accessToken: happy.account.sessionOpen("kirill@example.com"),
        refreshToken: null,
    } as never);
    happy.systemOpen(LINK);
    await vi.waitFor(() => expect(kind(happy)).toBe("offered"));
    happy.store.inviteJoin();
    await vi.waitFor(() => expect(happy.store.get()).toBeUndefined());
    // The same link again: no longer pending, so Happy Cloud will not even describe it.
    happy.systemOpen(LINK);
    await vi.waitFor(() =>
        expect(happy.store.get()).toMatchObject({ kind: "closed", code: "accepted" }),
    );
    expect(happy.store.get()).not.toHaveProperty("server");
});

it("asks for the invited email after a mismatch, and joins as that account", async () => {
    const happy = happyCreate();
    happy.account.inviteAdd({ ...invite, email: "steve@acme.com" });
    happy.sessions.directSignIn(HAPPY_CLOUD_ACCOUNT_ID, {
        accessToken: happy.account.sessionOpen("kirill@example.com"),
        refreshToken: "account-refresh",
    } as never);
    happy.systemOpen(LINK);
    await vi.waitFor(() => expect(kind(happy)).toBe("offered"));
    happy.store.inviteJoin();
    await vi.waitFor(() => expect(kind(happy)).toBe("mismatch"));
    expect(happy.store.get()).toMatchObject({ emailHint: "s•••@acme.com" });
    expect(happy.connected).toEqual([]);

    happy.store.inviteAccountSwitch();
    await vi.waitFor(() => expect(happy.browser.waiting()).toBe(1));
    // The first account is signed out here and its session revoked at Happy Cloud.
    expect(happy.account.requests.at(-1)).toMatchObject({ path: "/revoke" });
    happy.browser.signIn("steve@acme.com");
    await vi.waitFor(() => expect(happy.store.get()).toBeUndefined());
    expect(happy.connected).toEqual(["cloud-acme"]);
});

it("returns to the invitation when the sign-in is given up", async () => {
    const happy = happyCreate();
    happy.account.inviteAdd(invite);
    happy.systemOpen(LINK);
    await vi.waitFor(() => expect(kind(happy)).toBe("offered"));
    happy.store.inviteSignIn();
    await vi.waitFor(() => expect(happy.browser.waiting()).toBe(1));
    happy.store.inviteSignInCancel();
    expect(happy.store.get()).toMatchObject({ kind: "offered", signedIn: false });
    await vi.waitFor(() => expect(happy.browser.waiting()).toBe(0));
    expect(happy.store.get()).not.toHaveProperty("error");
    expect(happy.account.requests.map((request) => request.path)).toEqual(["/v1/invites/preview"]);
});

it("fails while Happy Cloud is unreachable, and Try again picks the invitation up", async () => {
    const happy = happyCreate();
    happy.account.inviteAdd(invite);
    happy.account.offline = true;
    happy.systemOpen(LINK);
    await vi.waitFor(() => expect(kind(happy)).toBe("failed"));
    happy.account.offline = false;
    happy.store.inviteRetry();
    await vi.waitFor(() => expect(kind(happy)).toBe("offered"));
});

it("calls a link invalid without asking Happy Cloud when its token is not in the fragment", async () => {
    const happy = happyCreate();
    happy.account.inviteAdd(invite);
    for (const url of [
        `happy://cloud/join?token=${TOKEN}`,
        `happy://cloud/join#${TOKEN.slice(1)}`,
        "happy://cloud/join",
    ]) {
        expect(happy.systemOpen(url)).toBe(true);
        expect(happy.store.get(), url).toMatchObject({ kind: "closed", code: "invalid" });
    }
    expect(happy.account.requests).toEqual([]);
    // Another path under happy://cloud is no invitation: it goes the way of any unknown link.
    expect(happy.systemOpen(`happy://cloud/joins#${TOKEN}`)).toBe(true);
    expect(happy.other).toEqual([`happy://cloud/joins#${TOKEN}`]);
    // An over-long link never reaches the window at all.
    expect(happy.systemOpen(`happy://cloud/join#${"a".repeat(5000)}`)).toBe(false);
});

it("replaces the invitation on show when another link arrives", async () => {
    const happy = happyCreate();
    const second = "7Hq2mZpX4tB9cLw0KdYs3FvNe6RgUj1ToAi5MhQx_-8";
    happy.account.serverAdd({ id: "s2", name: "guild" });
    happy.account.inviteAdd(invite);
    happy.account.inviteAdd({ token: second, serverId: "s2", roleName: "Admin" });
    happy.systemOpen(LINK);
    await vi.waitFor(() => expect(kind(happy)).toBe("offered"));
    happy.systemOpen(`happy://cloud/join#${second}`);
    await vi.waitFor(() =>
        expect(happy.store.get()).toMatchObject({
            kind: "offered",
            invite: { server: { name: "guild" }, roleName: "Admin" },
        }),
    );
});

it("says the app needs an update on a shell from before invitations", () => {
    const happy = happyCreate({ invites: false });
    happy.systemOpen(LINK);
    expect(happy.store.get()).toEqual({ kind: "unavailable" });
    expect(happy.account.requests).toEqual([]);
});

it("leaves an invite link to the unknown-link notice on a shell without Happy Cloud", () => {
    const other: string[] = [];
    const cloudServers = vi.fn();
    // No Cloud here: nothing is given to show the Cloud's links with.
    desktopExternalLinkRoute(LINK, { other: (url) => void other.push(url) });
    desktopExternalLinkRoute("happy://cloud/servers", { other: (url) => void other.push(url) });
    expect(other).toEqual([LINK, "happy://cloud/servers"]);
    // With it, each Cloud link goes to its own screen and nothing else does.
    const invites: unknown[] = [];
    const to = {
        cloudServers,
        cloudInvite: (link: unknown) => void invites.push(link),
        other: (url: string) => void other.push(url),
    };
    desktopExternalLinkRoute("happy://cloud/servers", to);
    desktopExternalLinkRoute(LINK, to);
    desktopExternalLinkRoute("happy://k3x9q2m7p0a4b8c1d5e6f7g2/agents/a1", to);
    expect(cloudServers).toHaveBeenCalledTimes(1);
    expect(invites).toEqual([{ kind: "invite", token: TOKEN }]);
    expect(other.at(-1)).toBe("happy://k3x9q2m7p0a4b8c1d5e6f7g2/agents/a1");
    expect(other).toHaveLength(3);
});
