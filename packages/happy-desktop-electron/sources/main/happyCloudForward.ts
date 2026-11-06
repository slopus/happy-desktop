import { request as httpsRequest } from "node:https";
import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import { happyCloudServerNameOf } from "../shared/happyCloud";
import type { ServerRemoteCredential } from "../shared/serverRemoteAuthorization";

const CLOUD_PATH = /^\/v0\/connections\/([a-z][a-z0-9_-]{0,63})\/api(\/.*)?$/u;

/** Headers the window's request never carries on to the cloud. */
const DROPPED = new Set([
    "authorization",
    "connection",
    "cookie",
    "happy-remote-authorization",
    "host",
    "origin",
    "proxy-authorization",
    "proxy-connection",
    "referer",
]);

/** The Happy Cloud connection a window path addresses, or `undefined` for any other path. */
export function happyCloudConnectionOf(path: string): string | undefined {
    const connectionId = CLOUD_PATH.exec(path)?.[1];
    return connectionId !== undefined && happyCloudServerNameOf(connectionId) !== undefined
        ? connectionId
        : undefined;
}

/**
 * Sends one window request straight to a Happy Cloud server with the person's
 * access token in `Authorization`. The host Happy Agent is not involved.
 * Without a sign-in it answers the host's own `403 remote_sign_in_required`,
 * so the window offers a sign-in exactly as it does for any team server.
 */
export function happyCloudForward(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    credential: ServerRemoteCredential | undefined,
): void {
    const json = (status: number, error: string, code: string): void => {
        response
            .writeHead(status, { "content-type": "application/json", "cache-control": "no-store" })
            .end(JSON.stringify({ error, code }));
    };
    if (!credential) {
        json(403, "Sign in to this server to use it.", "remote_sign_in_required");
        return;
    }
    const rest = CLOUD_PATH.exec(url.pathname)?.[2]?.slice(1) ?? "";
    const target = new URL(`${rest}${url.search}`, credential.serverUrl);
    const headers: Record<string, string | string[]> = {};
    for (const [name, value] of Object.entries(request.headers))
        if (value !== undefined && !DROPPED.has(name)) headers[name] = value;
    headers.authorization = `Bearer ${credential.accessToken}`;
    const send = target.protocol === "https:" ? httpsRequest : httpRequest;
    const outgoing = send(target, { method: request.method, headers }, (incoming) => {
        response.writeHead(incoming.statusCode ?? 502, incoming.headers);
        void pipeline(incoming, response).catch(() => response.destroy());
    });
    outgoing.on("error", () => {
        if (response.headersSent) response.destroy();
        else json(502, "This server isn't reachable right now.", "remote_unavailable");
    });
    request.once("aborted", () => outgoing.destroy());
    response.once("close", () => outgoing.destroy());
    request.pipe(outgoing);
}
