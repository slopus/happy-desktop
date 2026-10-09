import { Readable } from "node:stream";
import { net, session, type Session } from "electron";

const RELEASE_FETCH_PARTITION = "happy-agent-release";

/**
 * `fetch` for Happy Agent release lookups and downloads, carried by Chromium's
 * network stack instead of Node's.
 *
 * Chromium is what lets these requests reach GitHub wherever the browser that
 * downloaded Happy could: it follows the system proxy, PAC and WPAD included,
 * and trusts the system's certificates. The requests use an in-memory session
 * of their own because the default session's proxy is pointed at the local
 * Happy Agent, and because a release archive has no place in a browser cache.
 *
 * Electron's `net.fetch` leaves `Response.url` empty, and the release code
 * checks the URL a download finally came from, so this follows redirects
 * itself and records the last one. Usable only after the app is ready.
 */
export function electronReleaseFetchCreate(): typeof globalThis.fetch {
    let releaseSession: Session | undefined;
    return (input, init) =>
        new Promise<Response>((resolve, reject) => {
            const signal = init?.signal ?? undefined;
            if (signal?.aborted) {
                reject(signal.reason);
                return;
            }
            releaseSession ??= session.fromPartition(RELEASE_FETCH_PARTITION, { cache: false });
            let finalUrl =
                typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            const request = net.request({
                cache: "no-store",
                credentials: "omit",
                method: init?.method ?? "GET",
                redirect: "manual",
                session: releaseSession,
                url: finalUrl,
            });
            new Headers(init?.headers).forEach((value, name) => request.setHeader(name, value));
            let incoming: Readable | undefined;
            const abort = () => {
                request.abort();
                // The body is already someone else's stream; ending it with the
                // reason is how its reader learns why the bytes stopped.
                incoming?.destroy(signal?.reason);
                reject(signal?.reason);
            };
            signal?.addEventListener("abort", abort, { once: true });
            request.on("redirect", (_statusCode, _method, redirectUrl) => {
                finalUrl = redirectUrl;
                request.followRedirect();
            });
            request.on("response", (response) => {
                // Electron types its response as a bare stream; it is a Readable.
                const body = response as unknown as Readable;
                incoming = body;
                body.once("close", () => signal?.removeEventListener("abort", abort));
                const headers = new Headers();
                for (const [name, value] of Object.entries(response.headers))
                    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
                const empty =
                    [204, 205, 304].includes(response.statusCode) || init?.method === "HEAD";
                const result = new Response(
                    empty ? null : (Readable.toWeb(body) as ReadableStream<Uint8Array>),
                    {
                        headers,
                        status: response.statusCode,
                        statusText: response.statusMessage,
                    },
                );
                Object.defineProperty(result, "url", { value: finalUrl });
                resolve(result);
            });
            request.on("error", (error) => {
                signal?.removeEventListener("abort", abort);
                reject(error);
            });
            request.end();
        });
}
