import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import {
    HAPPY_CLOUD_ACCOUNT_ID,
    HAPPY_CLOUD_ACCOUNTS_URL,
    happyCloudConnectionId,
} from "../shared/happyCloud";
import { happyCloudCreate } from "./happyCloud";
import { HAPPY_CLOUD_ENDPOINTS, happyCloudEndpointsRead } from "./happyCloudEndpoints";
import type { ServerSessions } from "./serverSessions";

/*
 * A development run may point Happy Cloud at a local stack through its
 * environment; a packaged build never reads it. Pointed elsewhere, every
 * request and every token's audience follows: the account's to the accounts
 * service, each server's to that server's own address.
 */

const LOCAL = {
    HAPPY_CLOUD_ACCOUNTS_URL: "http://127.0.0.1:31341",
    HAPPY_CLOUD_SERVER_URL: "http://{name}.localhost:31340",
};

it("never reads the environment in a packaged build", () => {
    const endpoints = happyCloudEndpointsRead({ packaged: true, env: LOCAL });
    expect(endpoints).toBe(HAPPY_CLOUD_ENDPOINTS);
    expect(endpoints.accountsUrl).toBe("https://auth.happy.engineering/");
    expect(endpoints.serverUrl("acme")).toBe("https://acme.happy-clusters.com/");
    // Not even a value that would stop a development run.
    expect(
        happyCloudEndpointsRead({
            packaged: true,
            env: { HAPPY_CLOUD_ACCOUNTS_URL: "nonsense", HAPPY_CLOUD_SERVER_URL: "nonsense" },
        }),
    ).toBe(HAPPY_CLOUD_ENDPOINTS);
});

it("points a development run at a local stack, and at Happy Cloud without one", () => {
    const endpoints = happyCloudEndpointsRead({ packaged: false, env: LOCAL });
    expect(endpoints.accountsUrl).toBe("http://127.0.0.1:31341/");
    expect(endpoints.serverUrl("acme")).toBe("http://acme.localhost:31340/");
    expect(endpoints.serverUrl("beta")).toBe("http://beta.localhost:31340/");
    expect(happyCloudEndpointsRead({ packaged: false, env: {} })).toBe(HAPPY_CLOUD_ENDPOINTS);
    const accountsOnly = happyCloudEndpointsRead({
        packaged: false,
        env: { HAPPY_CLOUD_ACCOUNTS_URL: "http://127.0.0.1:31341/" },
    });
    expect(accountsOnly.serverUrl("acme")).toBe("https://acme.happy-clusters.com/");
});

it("stops a development run on a value it can't use", () => {
    const read = (env: Record<string, string>) => () =>
        happyCloudEndpointsRead({ packaged: false, env });
    expect(read({ HAPPY_CLOUD_ACCOUNTS_URL: "auth.local" })).toThrow("is not a URL");
    expect(read({ HAPPY_CLOUD_ACCOUNTS_URL: "ftp://127.0.0.1/" })).toThrow("http or https");
    expect(read({ HAPPY_CLOUD_SERVER_URL: "http://localhost:31340/" })).toThrow(
        "{name} exactly once",
    );
    expect(read({ HAPPY_CLOUD_SERVER_URL: "http://localhost:31340/{name}/" })).toThrow(
        "{name} in its host",
    );
    expect(read({ HAPPY_CLOUD_SERVER_URL: "http://{name}.localhost/?{name}" })).toThrow(
        "{name} exactly once",
    );
});

it("holds every token for the overridden address it is meant for", async () => {
    const directSignIn = vi.fn();
    const directChanged = vi.fn();
    let account: string | undefined;
    const sessions = {
        directSignIn: (connectionId: string, credential: { accessToken: string }) => {
            directSignIn(connectionId, credential);
            if (connectionId === HAPPY_CLOUD_ACCOUNT_ID) account = credential.accessToken;
        },
        directChanged,
        credential: (connectionId: string) =>
            connectionId === HAPPY_CLOUD_ACCOUNT_ID && account !== undefined
                ? { accessToken: account }
                : undefined,
    } as unknown as ServerSessions;
    const fetch = vi.fn(async (input: URL | string) => {
        const url = new URL(input);
        if (url.pathname === "/v1/auth/password")
            return Response.json({ access_token: "account-pass", expires_in: 3600 });
        if (url.pathname === "/v1/servers")
            return Response.json({
                servers: [
                    {
                        id: "srv_1",
                        name: "acme",
                        // An address the API hands over is never the one used.
                        url: "https://elsewhere.example/",
                        image: { thumbhash: "x", url: "/v1/servers/srv_1/image" },
                    },
                ],
            });
        if (url.pathname === "/v1/servers/srv_1/token")
            return Response.json({
                access_token: "server-pass",
                refresh_token: "server-refresh",
                expires_in: 3600,
            });
        return Response.json({}, { status: 404 });
    });
    const cloud = happyCloudCreate({
        listPath: join(mkdtempSync(join(tmpdir(), "happy-cloud-")), "servers.json"),
        fetch: fetch as unknown as typeof globalThis.fetch,
        sessions: () => sessions,
        endpoints: happyCloudEndpointsRead({ packaged: false, env: LOCAL }),
    });

    expect(cloud.direct.account).toMatchObject({
        serverUrl: "http://127.0.0.1:31341/",
        method: {
            authorizationUrl: "http://127.0.0.1:31341/authorize",
            tokenUrl: "http://127.0.0.1:31341/token",
            resource: "http://127.0.0.1:31341/",
        },
    });
    expect(await cloud.passwordSignIn("olga", "secret")).toEqual({ ok: true, value: undefined });
    expect(directSignIn).toHaveBeenLastCalledWith(
        HAPPY_CLOUD_ACCOUNT_ID,
        expect.objectContaining({
            resource: "http://127.0.0.1:31341/",
            serverUrl: "http://127.0.0.1:31341/",
        }),
    );

    const listed = await cloud.serversList();
    expect(listed).toMatchObject({
        ok: true,
        value: [{ id: "srv_1", name: "acme", url: "http://acme.localhost:31340/" }],
    });
    expect(await cloud.serverConnect("srv_1")).toEqual({
        ok: true,
        value: happyCloudConnectionId("acme"),
    });
    // The server's tokens are held for its overridden address, the audience the
    // local accounts service issued them for, and refresh at that service.
    expect(directSignIn).toHaveBeenLastCalledWith(
        happyCloudConnectionId("acme"),
        expect.objectContaining({
            accessToken: "server-pass",
            resource: "http://acme.localhost:31340/",
            serverUrl: "http://acme.localhost:31340/",
            refreshUrl: "http://127.0.0.1:31341/token",
        }),
    );
    // Requests for the server go to that same address.
    expect(cloud.direct.servers().get(happyCloudConnectionId("acme"))).toBe(
        "http://acme.localhost:31340/",
    );
    // Nothing went to Happy Cloud itself.
    const origins = fetch.mock.calls.map(([input]) => new URL(input).origin);
    expect(origins.every((origin) => origin === "http://127.0.0.1:31341")).toBe(true);
    expect(origins).not.toContain(new URL(HAPPY_CLOUD_ACCOUNTS_URL).origin);
});
