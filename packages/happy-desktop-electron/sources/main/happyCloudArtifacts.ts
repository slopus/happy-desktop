import type { IncomingHttpHeaders } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { HappyAgentClient, type Cuid2 } from "@slopus/happy-agent-client";
import { ArtifactSiteError, type ArtifactSiteClient } from "./artifactSite";
import type {
    HappyAgentDaemonRawResponse,
    HappyAgentRemoteAuthorization,
} from "./happyAgentDaemonClient";

/**
 * What a Happy Cloud connection's artifact sites read through: the server
 * itself, reached directly with the person's access token as the window
 * reaches it, since the host Happy Agent does not know Happy Cloud. The token
 * goes only to the address it was issued for and never leaves main; a site's
 * page is answered bytes, as from any other site.
 */
export function happyCloudArtifactClient(
    connectionId: string,
    remote: Pick<HappyAgentRemoteAuthorization, "credential" | "refresh">,
    fetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
): ArtifactSiteClient {
    const credentialRequire = () => {
        const credential = remote.credential(connectionId);
        if (!credential) throw new ArtifactSiteError(403, "Sign in to this server to use it.");
        return credential;
    };
    /**
     * Sends one request with the current token, and once more after a
     * refresh when the server refused it: a `401` was never processed, so
     * sending it again is safe.
     */
    const send = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const request = new Request(input, init);
        const body = request.body ? await request.arrayBuffer() : undefined;
        const credential = credentialRequire();
        if (new URL(request.url).origin !== new URL(credential.serverUrl).origin)
            throw new ArtifactSiteError(502, "This request is for another server.");
        const attempt = (token: string): Promise<Response> => {
            const headers = new Headers(request.headers);
            headers.set("authorization", `Bearer ${token}`);
            // The bytes are passed on as they arrive, length and range included.
            headers.set("accept-encoding", "identity");
            return fetch(request.url, {
                method: request.method,
                headers,
                signal: request.signal,
                // A redirect would carry the token to an address it was not issued for.
                redirect: "error",
                ...(body === undefined ? {} : { body }),
            });
        };
        const response = await attempt(credential.accessToken);
        if (response.status !== 401) return response;
        const fresh = await remote.refresh(connectionId, credential.accessToken);
        if (
            fresh === undefined ||
            fresh.serverUrl !== credential.serverUrl ||
            fresh.accessToken === credential.accessToken
        )
            return response;
        await response.body?.cancel();
        return attempt(fresh.accessToken);
    };
    const server = (): HappyAgentClient =>
        new HappyAgentClient({ endpoint: credentialRequire().serverUrl, fetch: send });
    const open = async (
        url: string,
        options: {
            readonly method: string;
            readonly headers: Readonly<Record<string, string>>;
            readonly body?: Buffer;
            readonly signal?: AbortSignal;
        },
    ): Promise<HappyAgentDaemonRawResponse> => {
        const response = await send(url, {
            method: options.method,
            headers: options.headers,
            ...(options.body === undefined ? {} : { body: new Uint8Array(options.body) }),
            ...(options.signal ? { signal: options.signal } : {}),
        });
        const headers: IncomingHttpHeaders = {};
        response.headers.forEach((value, name) => {
            headers[name] = value;
        });
        return {
            statusCode: response.status,
            headers,
            body: response.body
                ? Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>)
                : Readable.from([]),
        };
    };
    const fileOpen = (url: string, range?: string, signal?: AbortSignal) =>
        open(url, {
            method: "GET",
            headers: { accept: "*/*", ...(range === undefined ? {} : { range }) },
            ...(signal ? { signal } : {}),
        });
    return {
        getArtifactVersion: async (artifactId, version, signal) =>
            server().getArtifactVersion(
                artifactId as Cuid2,
                version,
                signal ? { signal } : undefined,
            ),
        openArtifactFile: async (artifactId, version, filePath, range, signal) =>
            fileOpen(
                server().artifactFileUrl(artifactId as Cuid2, version, filePath),
                range,
                signal,
            ),
        getVaultVersion: async (surfaceId, fileId, version, signal) =>
            server().getVaultVersion(
                surfaceId,
                fileId as Cuid2,
                version,
                signal ? { signal } : undefined,
            ),
        openVaultArtifactFile: async (surfaceId, fileId, version, filePath, range, signal) =>
            fileOpen(
                server().vaultArtifactFileUrl(surfaceId, fileId as Cuid2, version, filePath),
                range,
                signal,
            ),
        openArtifactApi: async (artifactId, rest, search, options) => {
            const endpoint = new URL(credentialRequire().serverUrl);
            const prefix = `${endpoint.pathname.replace(/\/$/u, "")}/v0/artifacts/${encodeURIComponent(artifactId)}/api/`;
            const url = new URL(`${prefix}${rest}${search}`, endpoint);
            // Dot segments resolved here would carry the token to a route
            // outside the artifact's API.
            if (!url.pathname.startsWith(prefix))
                throw new Error("The artifact API path is invalid.");
            return await open(url.href, options);
        },
    };
}
