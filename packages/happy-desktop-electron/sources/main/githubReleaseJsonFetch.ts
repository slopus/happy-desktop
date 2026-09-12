/** Shared bounds for optional native/Agent release metadata, not binary downloads. */
export async function githubReleaseJsonFetch(
    url: string,
    fetch_: typeof globalThis.fetch = globalThis.fetch,
    signal: AbortSignal = AbortSignal.timeout(30_000),
): Promise<unknown> {
    const response = await fetch_(url, {
        headers: {
            accept: "application/vnd.github+json",
            "user-agent": "Happy Desktop updater",
            "x-github-api-version": "2022-11-28",
        },
        signal,
    });
    const reader = response.body?.getReader();
    try {
        if (new URL(response.url).protocol !== "https:")
            throw new Error("GitHub update lookup redirected to an insecure URL.");
        if (!response.ok || !reader)
            throw new Error(`GitHub update lookup returned HTTP ${response.status}.`);
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > 4 * 1024 * 1024)
                throw new Error("GitHub update metadata exceeded its size limit.");
            chunks.push(chunk.value);
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } finally {
        await reader?.cancel().catch(() => undefined);
        reader?.releaseLock();
    }
}
