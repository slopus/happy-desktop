import { request as httpsRequest } from "node:https";
import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import { HAPPY_CLOUD_CONNECTION_ID } from "../shared/happyCloud";
import type { ServerRemoteCredential } from "../shared/serverRemoteAuthorization";

const CLOUD_PATH = `/v0/connections/${HAPPY_CLOUD_CONNECTION_ID}/api/`;

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

/** Whether `path` is the window's address for Happy Cloud. */
export function happyCloudPathIs(path: string): boolean {
    return path.startsWith(CLOUD_PATH) || path === CLOUD_PATH.slice(0, -1);
}

/**
 * Sends one window request straight to Happy Cloud with the person's access
 * token in `Authorization`. The host Happy Agent is not involved. Without a
 * sign-in it answers the host's own `403 remote_sign_in_required`, so the
 * window offers a sign-in exactly as it does for any team server.
 */
export function happyCloudForward(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    credential: ServerRemoteCredential | undefined,
): void {
    if (!credential) {
        response
            .writeHead(403, { "content-type": "application/json", "cache-control": "no-store" })
            .end(
                JSON.stringify({
                    error: "Sign in to Happy Cloud to use it.",
                    code: "remote_sign_in_required",
                }),
            );
        return;
    }
    const rest = url.pathname.slice(CLOUD_PATH.length);
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
        else
            response
                .writeHead(502, { "content-type": "application/json", "cache-control": "no-store" })
                .end(
                    JSON.stringify({
                        error: "Happy Cloud isn't reachable right now.",
                        code: "remote_unavailable",
                    }),
                );
    });
    request.once("aborted", () => outgoing.destroy());
    response.once("close", () => outgoing.destroy());
    request.pipe(outgoing);
}
