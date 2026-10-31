/**
 * The task icons one connection has drawn, by hash. Each is read once from
 * `GET /v0/task-icons/:slug?v=:hash` when a card on screen first asks for it,
 * and kept as an object URL until the connection closes. The catalog is never
 * read, and no slug list is held: any slug the daemon names is asked for.
 */
export interface HappyAgentTaskIconsStore {
    /** Each asked-for icon's object URL by hash; `null` for one that could not be read. */
    get(): ReadonlyMap<string, string | null>;
    subscribe(listener: () => void): () => void;
    /** Reads one icon unless it has been asked for already. */
    iconRequest(icon: { readonly slug: string; readonly hash: string }): void;
}

export function happyAgentTaskIconsCreate(deps: {
    readonly endpoint: string;
    readonly token: string;
    readonly fetch: typeof globalThis.fetch;
    /** The connection's lifetime; aborting it stops every read and frees every icon. */
    readonly signal: AbortSignal;
}): HappyAgentTaskIconsStore {
    const listeners = new Set<() => void>();
    const asked = new Set<string>();
    let icons: ReadonlyMap<string, string | null> = new Map();
    const settled = (hash: string, src: string | null): void => {
        if (deps.signal.aborted) {
            if (src !== null) URL.revokeObjectURL(src);
            return;
        }
        icons = new Map(icons).set(hash, src);
        for (const listener of listeners) listener();
    };
    deps.signal.addEventListener("abort", () => {
        listeners.clear();
        for (const src of icons.values()) if (src !== null) URL.revokeObjectURL(src);
    });
    return {
        get: () => icons,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        iconRequest({ slug, hash }) {
            if (deps.signal.aborted || asked.has(hash)) return;
            asked.add(hash);
            const base = deps.endpoint.replace(/\/$/u, "");
            void deps
                .fetch(`${base}/v0/task-icons/${encodeURIComponent(slug)}?v=${hash}`, {
                    headers: { authorization: `Bearer ${deps.token}` },
                    signal: deps.signal,
                })
                .then(async (response) => {
                    if (!response.ok) throw new Error(`Task icon ${slug}: ${response.status}`);
                    return URL.createObjectURL(await response.blob());
                })
                .then(
                    (src) => settled(hash, src),
                    // An icon that cannot be read stays the letter tile; asking again would not help.
                    () => settled(hash, null),
                );
        },
    };
}
