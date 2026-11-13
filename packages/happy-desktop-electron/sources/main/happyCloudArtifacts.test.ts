import { text } from "node:stream/consumers";
import { describe, expect, it, vi } from "vitest";
import type { ServerRemoteCredential } from "../shared/serverRemoteAuthorization";
import { happyCloudArtifactClient } from "./happyCloudArtifacts";

const SERVER = "https://acme.happy-clusters.com/";
const SURFACE = "p8k2m4q6s1t3v5x7z9b0c2d4";
const FILE = "f7h2j4k6m8n0p1q3r5s7t9v2";

function fixture(answers: readonly (() => Response)[]) {
    let credential: ServerRemoteCredential | undefined = {
        accessToken: "token-1",
        serverUrl: SERVER,
    };
    const sent: { url: string; init: RequestInit; authorization: string | null }[] = [];
    let index = 0;
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        sent.push({
            url: String(input),
            init: init ?? {},
            authorization: new Headers(init?.headers).get("authorization"),
        });
        return answers[Math.min(index++, answers.length - 1)]!();
    });
    const remote = {
        credential: vi.fn(() => credential),
        refresh: vi.fn(async (_connectionId: string, _rejected: string | undefined) => {
            credential = { accessToken: "token-2", serverUrl: SERVER };
            return credential;
        }),
    };
    return {
        client: happyCloudArtifactClient("cloud-acme", remote, fetch as typeof globalThis.fetch),
        fetch,
        remote,
        sent,
        signOut: () => {
            credential = undefined;
        },
    };
}

describe("happyCloudArtifactClient", () => {
    it("reads a vault app's version and files from the server with the person's token", async () => {
        const version = { version: { surfaceId: SURFACE, fileId: FILE, number: 3 } };
        const { client, sent } = fixture([
            () => Response.json(version),
            () =>
                new Response("bytes", {
                    status: 206,
                    headers: { "content-range": "bytes 0-4/9", "content-length": "5" },
                }),
        ]);
        expect(await client.getVaultVersion!(SURFACE, FILE, 3)).toEqual(version);
        const file = await client.openVaultArtifactFile!(
            SURFACE,
            FILE,
            3,
            "img/a b.png",
            "bytes=0-4",
        );
        expect(file.statusCode).toBe(206);
        expect(file.headers["content-range"]).toBe("bytes 0-4/9");
        expect(await text(file.body)).toBe("bytes");
        expect(sent.map(({ url }) => url)).toEqual([
            `${SERVER}v0/surfaces/vault/${SURFACE}/files/${FILE}/versions/3`,
            `${SERVER}v0/surfaces/vault/${SURFACE}/files/${FILE}/versions/3/artifact/img/a%20b.png`,
        ]);
        for (const { init, authorization } of sent) {
            expect(authorization).toBe("Bearer token-1");
            expect(init.redirect).toBe("error");
            expect(new Headers(init.headers).get("accept-encoding")).toBe("identity");
        }
        expect(new Headers(sent[1]!.init.headers).get("range")).toBe("bytes=0-4");
    });

    it("refreshes a refused token once and sends the request again", async () => {
        const { client, remote, sent } = fixture([
            () => new Response(null, { status: 401 }),
            () => new Response("ok"),
        ]);
        const file = await client.openArtifactFile("a1", 2, "index.html");
        expect(file.statusCode).toBe(200);
        expect(remote.refresh).toHaveBeenCalledWith("cloud-acme", "token-1");
        expect(sent.map(({ authorization }) => authorization)).toEqual([
            "Bearer token-1",
            "Bearer token-2",
        ]);
    });

    it("sends nothing without a sign-in", async () => {
        const { client, fetch, signOut } = fixture([() => new Response("unreachable")]);
        signOut();
        await expect(client.getArtifactVersion("a1", 2)).rejects.toMatchObject({ status: 403 });
        await expect(
            client.openVaultArtifactFile!(SURFACE, FILE, 3, "index.html"),
        ).rejects.toMatchObject({
            status: 403,
        });
        expect(fetch).not.toHaveBeenCalled();
    });

    it("forwards an artifact's API requests and never one that leaves the API", async () => {
        const { client, sent } = fixture([() => Response.json({ value: 1 })]);
        const answer = await client.openArtifactApi("a1", "kv/a%20b", "?x=1", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: Buffer.from('{"value":1}'),
        });
        expect(answer.statusCode).toBe(200);
        expect(sent).toHaveLength(1);
        expect(sent[0]!.url).toBe(`${SERVER}v0/artifacts/a1/api/kv/a%20b?x=1`);
        expect(sent[0]!.init.method).toBe("PUT");
        expect(Buffer.from(sent[0]!.init.body as ArrayBuffer).toString()).toBe('{"value":1}');
        for (const rest of ["../../secrets", "%2e%2e/%2e%2e/secrets", "x/../../../v0/secrets"])
            await expect(
                client.openArtifactApi("a1", rest, "", { method: "GET", headers: {} }),
            ).rejects.toThrow("The artifact API path is invalid.");
        expect(sent).toHaveLength(1);
    });
});
