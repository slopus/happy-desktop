import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { text } from "node:stream/consumers";
import { afterEach, expect, it } from "vitest";
import {
    HappyAgentDaemonClient,
    type HappyAgentRemoteAuthorization,
} from "./happyAgentDaemonClient";
import { localAgentSocketPath } from "./localAgentSocketPath";

/*
 * The host Happy Agent holds no team-server token: every request this client
 * sends through `/v0/connections/<id>/api/` carries the shell's, in its own
 * header, and nothing else ever does. When the daemon says the server needs a
 * sign-in, the request goes once more after a refresh, and no more. A token is
 * sent only while the roster names the address it was issued for.
 */

const SERVER = "https://happy.example.com/";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
});

interface Seen {
    readonly path: string;
    readonly headers: IncomingHttpHeaders;
}

async function daemonStart(
    answer: (seen: Seen) => { status: number; body: unknown },
): Promise<{ socketPath: string; seen: Seen[]; roster: { url: string | undefined } }> {
    const roster: { url: string | undefined } = { url: SERVER };
    const directory = await mkdtemp(join(tmpdir(), "happy-remote-auth-"));
    // Windows serves the daemon on a named pipe, never on a file path.
    const socketPath = localAgentSocketPath(directory);
    const seen: Seen[] = [];
    const server: Server = createServer((request, response) => {
        if (request.url === "/v0/connections") {
            request.resume();
            response.writeHead(200, { "content-type": "application/json" });
            response.end(
                JSON.stringify({
                    connections:
                        roster.url === undefined
                            ? []
                            : [
                                  {
                                      id: "team",
                                      name: "Team",
                                      orderKey: "5",
                                      authentication: "oauth",
                                      url: roster.url,
                                  },
                              ],
                    version: "v",
                }),
            );
            return;
        }
        const entry = { path: request.url ?? "", headers: request.headers };
        seen.push(entry);
        request.resume();
        const { status, body } = answer(entry);
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(body));
    });
    // A failed listen would otherwise leave the test waiting until it times out.
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, resolve);
    });
    cleanups.push(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await rm(directory, { force: true, recursive: true });
    });
    return { socketPath, seen, roster };
}

function remoteCreate(initial: string, refreshed?: string) {
    const bound = (accessToken: string | undefined) =>
        accessToken === undefined ? undefined : { accessToken, serverUrl: SERVER };
    let current: string | undefined = initial;
    const calls = {
        refresh: [] as (string | undefined)[],
        required: [] as string[],
        moved: [] as string[],
    };
    const remote: HappyAgentRemoteAuthorization = {
        credential: () => bound(current),
        refresh(_connectionId, rejected) {
            calls.refresh.push(rejected);
            current = refreshed;
            return Promise.resolve(bound(refreshed));
        },
        signInRequire(_connectionId, rejected) {
            calls.required.push(rejected);
        },
        serverMoved(connectionId, serverUrl) {
            calls.moved.push(`${connectionId} ${serverUrl}`);
        },
    };
    return { remote, calls };
}

const SIGN_IN_REQUIRED = { error: "Sign in again.", code: "remote_sign_in_required" };

it("adds the server's token only under its connection, whatever the window sent", async () => {
    const daemon = await daemonStart(() => ({ status: 200, body: {} }));
    const { remote } = remoteCreate("access-1");
    const client = new HappyAgentDaemonClient(
        { socketPath: daemon.socketPath, token: "local" },
        remote,
    );
    for (const path of ["/v0/connections/team/api/v0/health", "/v0/health"])
        await client.rawRequest({
            method: "GET",
            path,
            headers: { "happy-remote-authorization": "Bearer forged", authorization: "Bearer x" },
        });
    expect(daemon.seen.map((entry) => entry.headers["happy-remote-authorization"])).toEqual([
        "Bearer access-1",
        undefined,
    ]);
    expect(daemon.seen.map((entry) => entry.headers.authorization)).toEqual([
        "Bearer local",
        "Bearer local",
    ]);
    // The SDK's own requests through a connection carry it too.
    await client.connection("team").health();
    expect(daemon.seen.at(-1)?.headers["happy-remote-authorization"]).toBe("Bearer access-1");
});

it("sends a refused request once more after a refresh", async () => {
    const daemon = await daemonStart(({ headers }) =>
        headers["happy-remote-authorization"] === "Bearer access-2"
            ? { status: 200, body: { ok: true } }
            : { status: 403, body: SIGN_IN_REQUIRED },
    );
    const { remote, calls } = remoteCreate("access-1", "access-2");
    const client = new HappyAgentDaemonClient(
        { socketPath: daemon.socketPath, token: "local" },
        remote,
    );
    const response = await client.rawRequest({
        method: "POST",
        path: "/v0/connections/team/api/v0/things",
        body: Buffer.from("{}"),
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(await text(response.body))).toEqual({ ok: true });
    expect(calls.refresh).toEqual(["access-1"]);
    expect(daemon.seen).toHaveLength(2);
});

it("hands the second refusal back as it came, and asks for a new sign-in", async () => {
    const daemon = await daemonStart(() => ({ status: 403, body: SIGN_IN_REQUIRED }));
    const { remote, calls } = remoteCreate("access-1", "access-2");
    const client = new HappyAgentDaemonClient(
        { socketPath: daemon.socketPath, token: "local" },
        remote,
    );
    const response = await client.rawRequest({
        method: "GET",
        path: "/v0/connections/team/api/v0/health",
    });
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(await text(response.body))).toEqual(SIGN_IN_REQUIRED);
    expect(daemon.seen).toHaveLength(2);
    expect(calls.required).toEqual(["access-2"]);
});

it("passes a server's own 403 through untouched, with no refresh", async () => {
    const daemon = await daemonStart(() => ({
        status: 403,
        body: { error: "Not yours.", code: "forbidden" },
    }));
    const { remote, calls } = remoteCreate("access-1", "access-2");
    const client = new HappyAgentDaemonClient(
        { socketPath: daemon.socketPath, token: "local" },
        remote,
    );
    const response = await client.rawRequest({
        method: "GET",
        path: "/v0/connections/team/api/v0/forbidden",
    });
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(await text(response.body))).toEqual({
        error: "Not yours.",
        code: "forbidden",
    });
    expect(calls.refresh).toEqual([]);
});

it("sends no token once the roster names another address for the connection, or none", async () => {
    const daemon = await daemonStart(() => ({ status: 200, body: {} }));
    const { remote, calls } = remoteCreate("access-1");
    const client = new HappyAgentDaemonClient(
        { socketPath: daemon.socketPath, token: "local" },
        remote,
    );
    const path = "/v0/connections/team/api/v0/health";
    await client.rawRequest({ method: "GET", path });
    daemon.roster.url = "https://elsewhere.example.com/";
    await client.rawRequest({ method: "GET", path });
    await client.connection("team").health();
    daemon.roster.url = undefined;
    await client.rawRequest({ method: "GET", path });
    expect(daemon.seen.map((entry) => entry.headers["happy-remote-authorization"])).toEqual([
        "Bearer access-1",
        undefined,
        undefined,
        undefined,
    ]);
    expect(calls.moved).toEqual([`team ${SERVER}`, `team ${SERVER}`, `team ${SERVER}`]);
});

it("does not retry with a refreshed token bound to an address the roster no longer names", async () => {
    const daemon = await daemonStart(() => ({ status: 403, body: SIGN_IN_REQUIRED }));
    const { remote, calls } = remoteCreate("access-1", "access-2");
    const client = new HappyAgentDaemonClient(
        { socketPath: daemon.socketPath, token: "local" },
        {
            ...remote,
            refresh(connectionId, rejected) {
                daemon.roster.url = "https://elsewhere.example.com/";
                return remote.refresh(connectionId, rejected);
            },
        },
    );
    const response = await client.rawRequest({
        method: "GET",
        path: "/v0/connections/team/api/v0/health",
    });
    expect(response.statusCode).toBe(403);
    expect(daemon.seen).toHaveLength(1);
    expect(calls.moved).toEqual([`team ${SERVER}`]);
});
