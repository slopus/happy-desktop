import { createHmac } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { connect } from "node:net";
import { unlink } from "node:fs/promises";

/*
 * Team mode for the demo gym. A team daemon serves its API on TCP only and
 * authenticates every request with a member's bearer token, here an HS256 JWT
 * the gym signs with a secret it hands the daemon. Each member gets a private
 * Unix socket in the run root that forwards to that TCP listener as them, so
 * every existing socket client (the gym client, the desktop's dev proxy) talks
 * to the team daemon unchanged, as one specific person.
 */

export const TEAM_ISSUER = "http://127.0.0.1:1";
export const TEAM_AUDIENCE = "happy-demo";

const base64url = (value) => Buffer.from(value).toString("base64url");

/** A member's access token: `sub` is the member key the daemon's seed table names. */
export function teamTokenSign(secret, subject) {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = base64url(
        JSON.stringify({
            sub: subject,
            iss: TEAM_ISSUER,
            aud: TEAM_AUDIENCE,
            iat: now,
            exp: now + 7 * 24 * 3600,
        }),
    );
    const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
    return `${header}.${payload}.${base64url(signature)}`;
}

/** The machine configuration a team gym runs on: JWT sign-in and the seeded members. */
export function teamConfigToml({ port, members, node }) {
    const lines = [
        "[settings]",
        "happy_integration = false",
        "",
        // The installation's own display name, as the rail and phones show it.
        ...(node ? ["[node]", `name = ${JSON.stringify(node)}`, ""] : []),
        "[feature.team]",
        "enabled = true",
        'authentication = "jwt"',
        'host = "127.0.0.1"',
        `port = ${port}`,
        `owner_user_id = ${JSON.stringify(members.find((member) => member.owner).key)}`,
        "",
        "[feature.team.jwt]",
        'name = "Demo SSO"',
        `authorization_url = ${JSON.stringify(`${TEAM_ISSUER}/authorize`)}`,
        `token_url = ${JSON.stringify(`${TEAM_ISSUER}/token`)}`,
        'client_id = "happy"',
        `issuer = ${JSON.stringify(TEAM_ISSUER)}`,
        `audience = ${JSON.stringify(TEAM_AUDIENCE)}`,
        'algorithms = ["HS256"]',
        'secret_env = "HAPPY_TEAM_JWT_SECRET"',
        "",
    ];
    for (const member of members) {
        lines.push(`[feature.team.members.${member.key}]`);
        lines.push(`name = ${JSON.stringify(member.name)}`);
        for (const field of ["email", "role", "follows"])
            if (member[field]) lines.push(`${field} = ${JSON.stringify(member[field])}`);
        lines.push(`auto_join_tasks = ${member.autoJoinTasks === false ? "false" : "true"}`);
        lines.push("");
    }
    return lines.join("\n");
}

/**
 * Serves HTTP, SSE and WebSocket upgrades on a Unix socket and forwards them to
 * the team listener with this member's bearer token in place of the caller's.
 */
export async function teamProxyOpen({ socketPath, port, token }) {
    await unlink(socketPath).catch(() => undefined);
    const authorization = `Bearer ${token}`;
    const server = createServer((request, response) => {
        const upstream = httpRequest(
            {
                host: "127.0.0.1",
                port,
                path: request.url,
                method: request.method,
                headers: { ...request.headers, host: `127.0.0.1:${port}`, authorization },
            },
            (incoming) => {
                response.writeHead(incoming.statusCode ?? 502, incoming.headers);
                // Server-sent events must reach the client as they are written.
                response.flushHeaders();
                incoming.pipe(response);
            },
        );
        upstream.on("error", (error) => {
            if (!response.headersSent) response.writeHead(502);
            response.end(String(error));
        });
        request.pipe(upstream);
    });
    server.on("upgrade", (request, socket, head) => {
        const upstream = connect(port, "127.0.0.1", () => {
            const headers = { ...request.headers, host: `127.0.0.1:${port}`, authorization };
            upstream.write(
                `${request.method} ${request.url} HTTP/1.1\r\n${Object.entries(headers)
                    .map(([name, value]) => `${name}: ${value}`)
                    .join("\r\n")}\r\n\r\n`,
            );
            if (head?.length) upstream.write(head);
            upstream.pipe(socket);
            socket.pipe(upstream);
        });
        upstream.on("error", () => socket.destroy());
        socket.on("error", () => upstream.destroy());
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, resolve);
    });
    return {
        socketPath,
        close: () => new Promise((resolve) => server.close(() => resolve())),
    };
}
