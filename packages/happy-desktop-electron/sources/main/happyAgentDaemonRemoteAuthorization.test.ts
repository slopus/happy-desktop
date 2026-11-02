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

/*
 * The host Happy Agent holds no team-server token: every request this client
 * sends through `/v0/connections/<id>/api/` carries the shell's, in its own
 * header, and nothing else ever does. When the daemon says the server needs a
 * sign-in, the request goes once more after a refresh, and no more.
 */

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
): Promise<{ socketPath: string; seen: Seen[] }> {
    const directory = await mkdtemp(join(tmpdir(), "happy-remote-auth-"));
    const socketPath = join(directory, "s.sock");
    const seen: Seen[] = [];
    const server: Server = createServer((request, response) => {
        const entry = { path: request.url ?? "", headers: request.headers };
        seen.push(entry);
        request.resume();
        const { status, body } = answer(entry);
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(body));
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    cleanups.push(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await rm(directory, { force: true, recursive: true });
    });
    return { socketPath, seen };
}

function remoteCreate(initial: string, refreshed?: string) {
    let current: string | undefined = initial;
    const calls = { refresh: [] as (string | undefined)[], required: [] as string[] };
    const remote: HappyAgentRemoteAuthorization = {
        token: () => current,
        refresh(_connectionId, rejected) {
            calls.refresh.push(rejected);
            current = refreshed;
            return Promise.resolve(refreshed);
        },
        signInRequire(_connectionId, rejected) {
            calls.required.push(rejected);
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
