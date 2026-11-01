import { happyExternalLinkParse } from "./happyInstanceLink.js";

/** Where the window stands with the server an instance link names. */
export type HappyLinkTarget =
    /** A connection with that instance is live: the link opens there now. */
    | { readonly kind: "live"; readonly happyAgentId: string }
    /** A connection with that instance is known but not live yet; `label` names it. */
    | { readonly kind: "waiting"; readonly label: string }
    /** No connection reports that instance, but one has not said which it is yet. */
    | { readonly kind: "undetermined" }
    /** Every connection has said which instance it is, and none is that one. */
    | { readonly kind: "unknown" };

/** Why a link from outside was not opened, said once until dismissed. */
export type HappyLinkNotice =
    | { readonly kind: "unknownServer" }
    | { readonly kind: "unreachable"; readonly label: string }
    | { readonly kind: "unsupported" };

export interface HappyLinkInboxSnapshot {
    readonly notice?: HappyLinkNotice;
}

export interface HappyLinkInboxStore {
    get(): HappyLinkInboxSnapshot;
    subscribe(listener: () => void): () => void;
    /** A `happy://` URL reached the window from the system. */
    linkReceive(url: string): void;
    /** The window's connections changed: waiting links are resolved again. */
    targetsChange(): void;
    noticeDismiss(): void;
    [Symbol.dispose](): void;
}

export interface HappyLinkInboxStoreDeps {
    /** Which connection, if any, holds the instance; read on every resolution. */
    resolve(instanceId: string): HappyLinkTarget;
    /** Opens the internal link `url` on the live connection `happyAgentId`. */
    open(happyAgentId: string, url: string): void;
    /** How long a link waits for its server; a minute by default. */
    readonly waitMs?: number;
}

/** The most links held at once; an older one gives way to a newer. */
const PENDING_MAX = 8;
const WAIT_MS = 60_000;

interface Pending {
    readonly instanceId: string;
    readonly url: string;
    readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * Links that reached the window from outside, held until the server each one
 * names is live. A link opens only on the connection whose instance matches
 * it exactly; it never falls back to another one. The constructor opens
 * nothing: a link's wait is started by its arrival and ended by its opening,
 * its expiry, or disposal.
 */
export function happyLinkInboxStoreCreate(deps: HappyLinkInboxStoreDeps): HappyLinkInboxStore {
    const listeners = new Set<() => void>();
    const waitMs = deps.waitMs ?? WAIT_MS;
    let snapshot: HappyLinkInboxSnapshot = {};
    let pending: Pending[] = [];
    let disposed = false;

    const publish = (next: HappyLinkInboxSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const noticeShow = (notice: HappyLinkNotice): void => publish({ notice });
    const remove = (entry: Pending): void => {
        clearTimeout(entry.timer);
        pending = pending.filter((candidate) => candidate !== entry);
    };
    /** Opens or refuses each held link its server now decides; keeps the rest waiting. */
    const settle = (): void => {
        // `remove` replaces the array, so this walks the links held when it began;
        // one an opening already settled, through a nested change, is skipped.
        for (const entry of pending) {
            if (!pending.includes(entry)) continue;
            const target = deps.resolve(entry.instanceId);
            if (target.kind === "live") {
                remove(entry);
                deps.open(target.happyAgentId, entry.url);
            } else if (target.kind === "unknown") {
                remove(entry);
                noticeShow({ kind: "unknownServer" });
            }
        }
    };
    const expire = (entry: Pending): void => {
        if (disposed || !pending.includes(entry)) return;
        remove(entry);
        const target = deps.resolve(entry.instanceId);
        if (target.kind === "live") deps.open(target.happyAgentId, entry.url);
        else if (target.kind === "waiting")
            noticeShow({ kind: "unreachable", label: target.label });
        else noticeShow({ kind: "unknownServer" });
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        linkReceive(url) {
            if (disposed) return;
            const link = happyExternalLinkParse(url);
            if (link.kind === "unsupported") {
                noticeShow({ kind: "unsupported" });
                return;
            }
            const oldest = pending.length >= PENDING_MAX ? pending[0] : undefined;
            if (oldest) remove(oldest);
            const entry: Pending = {
                instanceId: link.instanceId,
                url: link.url,
                timer: setTimeout(() => expire(entry), waitMs),
            };
            pending = [...pending, entry];
            settle();
        },
        targetsChange() {
            if (!disposed && pending.length > 0) settle();
        },
        noticeDismiss() {
            if (snapshot.notice !== undefined) publish({});
        },
        [Symbol.dispose]() {
            disposed = true;
            for (const entry of pending) clearTimeout(entry.timer);
            pending = [];
            listeners.clear();
        },
    };
}
