import { randomBytes } from "node:crypto";
import { HAPPY_CLOUD_API_URL } from "../shared/happyCloud";

/**
 * Happy Cloud's account API as the shell meets it, for tests: account
 * sessions, the servers an account belongs to, their tokens, and invitations
 * previewed and accepted by token. It answers requests in memory, as a
 * `fetch` the shell is given in place of the network, because the account
 * API's address is fixed in the shell.
 *
 * Invitations behave as the cluster's do. A preview needs no session. An
 * accept needs the account's session, checks an email invitation's address
 * before anything else, and is idempotent for an account already on the
 * server while the invitation is still pending. An invitation that is no
 * longer pending answers `410` with why, to whoever asks.
 */
export interface FakeHappyCloudAccount {
    /** Give this to the shell as its `fetch`. */
    readonly fetch: typeof globalThis.fetch;
    /** Every request received, oldest first. */
    readonly requests: readonly FakeHappyCloudAccountRequest[];
    /** Opens a session for the account with this verified address; answers its access token. */
    sessionOpen(email: string): string;
    /** Ends a session: its token is refused from then on. */
    sessionEnd(accessToken: string): void;
    serverAdd(server: FakeHappyCloudAccountServer): void;
    /** Puts the account with this address on a server, as an invitation accepted elsewhere would. */
    memberAdd(serverId: string, email: string): void;
    inviteAdd(invite: FakeHappyCloudAccountInvite): void;
    inviteRevoke(token: string): void;
    /** Makes every request fail as an unreachable network does, until set back. */
    offline: boolean;
    /** Makes every request answer `500`, until set back. */
    failing: boolean;
}

export interface FakeHappyCloudAccountRequest {
    readonly method: string;
    /** The whole address asked for, query included. */
    readonly url: string;
    readonly path: string;
    readonly authorization?: string;
    readonly credentials?: RequestCredentials;
    /** The body as sent. */
    readonly body?: string;
}

export interface FakeHappyCloudAccountServer {
    readonly id: string;
    readonly name: string;
    readonly displayName?: string;
    /** The server's picture, as the invitation carries it inline. */
    readonly image?: string;
}

export interface FakeHappyCloudAccountInvite {
    readonly token: string;
    readonly serverId: string;
    readonly roleName: string;
    readonly inviter?: { readonly name?: string; readonly image?: string };
    /** Defaults to a week from now. */
    readonly expiresAt?: string;
    /** An email invitation: only the account with this address may accept it, once. */
    readonly email?: string;
    /** A link invitation: how many new members it admits. Unlimited when absent. */
    readonly uses?: number;
}

type InviteStatus = "pending" | "expired" | "revoked" | "exhausted" | "accepted";

const SENTENCES: Record<Exclude<InviteStatus, "pending"> | "invalid", string> = {
    invalid: "This invitation link isn't valid.",
    expired: "This invitation has expired. Ask for a new one.",
    revoked: "This invitation was revoked.",
    exhausted: "This invitation has been used as many times as it allows.",
    accepted: "This invitation has already been accepted.",
};

export function fakeHappyCloudAccountCreate(): FakeHappyCloudAccount {
    const origin = new URL(HAPPY_CLOUD_API_URL).origin;
    const requests: FakeHappyCloudAccountRequest[] = [];
    /** Access token to the account's verified address. */
    const sessions = new Map<string, string>();
    const servers = new Map<string, FakeHappyCloudAccountServer>();
    /** Server ID to its members' addresses. */
    const members = new Map<string, Set<string>>();
    const invites = new Map<
        string,
        { readonly invite: FakeHappyCloudAccountInvite; status: InviteStatus; used: number }
    >();

    const membersOf = (serverId: string): Set<string> => {
        const existing = members.get(serverId);
        if (existing) return existing;
        const created = new Set<string>();
        members.set(serverId, created);
        return created;
    };
    const serverView = (server: FakeHappyCloudAccountServer) => ({
        id: server.id,
        name: server.name,
        displayName: server.displayName ?? null,
        image: null,
    });
    /** The address with all but its first letter and its domain hidden. */
    const emailMask = (email: string): string => {
        const [local = "", domain = ""] = email.split("@");
        return `${local.slice(0, 1)}•••@${domain}`;
    };
    const closed = (code: keyof typeof SENTENCES): Response =>
        Response.json({ code, error: SENTENCES[code] }, { status: 410 });
    /** The invitation a token names, with its expiry applied; nothing for an unknown token. */
    const inviteRead = (token: unknown) => {
        const entry = typeof token === "string" ? invites.get(token) : undefined;
        if (!entry) return undefined;
        if (
            entry.status === "pending" &&
            entry.invite.expiresAt !== undefined &&
            Date.parse(entry.invite.expiresAt) <= Date.now()
        )
            entry.status = "expired";
        return entry;
    };

    const answer = (request: FakeHappyCloudAccountRequest): Response => {
        const { method, path } = request;
        let body: Record<string, unknown> = {};
        try {
            body = request.body ? (JSON.parse(request.body) as Record<string, unknown>) : {};
        } catch {
            // A body that is not JSON carries nothing this API reads.
        }
        if (method === "POST" && path === "/revoke") return new Response("", { status: 200 });
        if (method === "POST" && path === "/v1/invites/preview") {
            const entry = inviteRead(body.token);
            if (!entry) return closed("invalid");
            if (entry.status !== "pending") return closed(entry.status);
            const server = servers.get(entry.invite.serverId);
            if (!server) return closed("invalid");
            const { inviter } = entry.invite;
            return Response.json({
                server: {
                    name: server.name,
                    displayName: server.displayName ?? null,
                    image: server.image ?? null,
                },
                inviter: inviter
                    ? { name: inviter.name ?? null, image: inviter.image ?? null }
                    : null,
                roleName: entry.invite.roleName,
                expiresAt:
                    entry.invite.expiresAt ??
                    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            });
        }
        // Everything below is the account's own.
        const bearer = /^Bearer (.+)$/u.exec(request.authorization ?? "")?.[1];
        const email = bearer === undefined ? undefined : sessions.get(bearer);
        if (email === undefined)
            return Response.json(
                { code: "unauthorized", error: "Sign in to continue." },
                { status: 401 },
            );
        if (method === "POST" && path === "/v1/invites/accept") {
            const entry = inviteRead(body.token);
            if (!entry) return closed("invalid");
            if (entry.status !== "pending") return closed(entry.status);
            const server = servers.get(entry.invite.serverId);
            if (!server) return closed("invalid");
            // The address is checked before membership: a member signed in
            // with another address is still told to use the invited one.
            if (entry.invite.email !== undefined && entry.invite.email !== email)
                return Response.json(
                    {
                        code: "email_mismatch",
                        error: "This invitation was sent to another email address.",
                        emailHint: emailMask(entry.invite.email),
                    },
                    { status: 403 },
                );
            const serverMembers = membersOf(server.id);
            const joining = !serverMembers.has(email);
            serverMembers.add(email);
            if (entry.invite.email !== undefined) entry.status = "accepted";
            else if (joining) {
                entry.used += 1;
                if (entry.invite.uses !== undefined && entry.used >= entry.invite.uses)
                    entry.status = "exhausted";
            }
            return Response.json({ server: serverView(server) });
        }
        if (method === "GET" && path === "/v1/servers")
            return Response.json({
                servers: [...servers.values()]
                    .filter((server) => membersOf(server.id).has(email))
                    .map(serverView),
            });
        const token = /^\/v1\/servers\/([^/]+)\/token$/u.exec(path);
        if (method === "POST" && token) {
            const serverId = decodeURIComponent(token[1] ?? "");
            if (!servers.has(serverId) || !membersOf(serverId).has(email))
                return Response.json(
                    { code: "not_found", error: "No such server." },
                    { status: 404 },
                );
            return Response.json({
                access_token: `server-access-${serverId}`,
                refresh_token: `server-refresh-${serverId}`,
                expires_in: 900,
            });
        }
        return Response.json({ code: "not_found", error: "Not found." }, { status: 404 });
    };

    const fake: FakeHappyCloudAccount = {
        requests,
        offline: false,
        failing: false,
        fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.origin !== origin)
                throw new TypeError(`The fake account API was asked for ${url.origin}.`);
            const headers = new Headers(init?.headers);
            const authorization = headers.get("authorization");
            const request: FakeHappyCloudAccountRequest = {
                method: init?.method ?? "GET",
                url: url.href,
                path: url.pathname,
                ...(authorization === null ? {} : { authorization }),
                ...(init?.credentials === undefined ? {} : { credentials: init.credentials }),
                ...(typeof init?.body === "string" ? { body: init.body } : {}),
            };
            requests.push(request);
            if (fake.offline) throw new TypeError("fetch failed");
            if (fake.failing)
                return Response.json({ code: "internal", error: "Try again." }, { status: 500 });
            return answer(request);
        }) as typeof globalThis.fetch,
        sessionOpen(email) {
            const accessToken = `account-${randomBytes(12).toString("base64url")}`;
            sessions.set(accessToken, email);
            return accessToken;
        },
        sessionEnd(accessToken) {
            sessions.delete(accessToken);
        },
        serverAdd(server) {
            servers.set(server.id, server);
        },
        memberAdd(serverId, email) {
            membersOf(serverId).add(email);
        },
        inviteAdd(invite) {
            invites.set(invite.token, { invite, status: "pending", used: 0 });
        },
        inviteRevoke(token) {
            const entry = invites.get(token);
            if (entry) entry.status = "revoked";
        },
    };
    return fake;
}
