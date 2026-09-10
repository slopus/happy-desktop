import { HappyAgentApiError, type HappyAgentClient } from "@slopus/happy-agent-client";

/** The only user data copied into transcripts. Transport revisions stay private. */
export interface UserProfile {
    readonly id: string;
    readonly name: string;
    readonly avatar: { readonly thumbhash: string } | null;
}

interface UserRecord {
    stale: boolean;
    pending?: Promise<void>;
    retryAt?: number;
    failures: number;
}

/** One connection's shared, batched identity resolver. No requests open at construction. */
export function userProfilesCreate(options: {
    readonly client: Pick<HappyAgentClient, "getUsers">;
    readonly signal: AbortSignal;
    readonly changed: (id: string) => void;
}) {
    const profiles = new Map<string, UserProfile>();
    const records = new Map<string, UserRecord>();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRetries = (): void => {
        clearTimeout(retryTimer);
        retryTimer = undefined;
        if (options.signal.aborted) return;
        let earliest = Infinity;
        for (const record of records.values())
            earliest = Math.min(earliest, record.retryAt ?? Infinity);
        if (!Number.isFinite(earliest)) return;
        retryTimer = setTimeout(
            () => {
                retryTimer = undefined;
                const now = Date.now();
                const due = [...records].flatMap(([id, record]) =>
                    record.retryAt !== undefined && record.retryAt <= now ? [id] : [],
                );
                void refresh(due);
            },
            Math.max(0, earliest - Date.now()),
        );
    };
    const publish = (profile: UserProfile): void => {
        const previous = profiles.get(profile.id);
        if (
            previous?.name === profile.name &&
            previous.avatar?.thumbhash === profile.avatar?.thumbhash
        )
            return;
        profiles.set(profile.id, profile);
        options.changed(profile.id);
    };
    const deleted = (id: string): UserProfile => ({ id, name: "DELETED", avatar: null });

    async function fetchBatch(ids: readonly string[]): Promise<void> {
        try {
            const response = await options.client.getUsers(ids, {
                signal: AbortSignal.any([options.signal, AbortSignal.timeout(5_000)]),
            });
            if (options.signal.aborted) return;
            const users = new Map(response.users.map((user) => [user.id, user]));
            for (const id of ids) {
                const record = records.get(id)!;
                if (record.stale) continue;
                record.failures = 0;
                const user = users.get(id);
                publish(
                    user
                        ? {
                              id,
                              name: user.name,
                              avatar:
                                  user.photo === null ? null : { thumbhash: user.photo.thumbhash },
                          }
                        : deleted(id),
                );
            }
        } catch (error) {
            if (options.signal.aborted) return;
            const unavailable =
                error instanceof HappyAgentApiError &&
                (error.status === 404 || error.status === 410);
            for (const id of ids) {
                const record = records.get(id)!;
                if (record.stale) continue;
                record.failures += 1;
                // Keep a known identity through brief outages. Unknown identities
                // still resolve before a message is published, and recover later.
                if (unavailable || !profiles.has(id) || record.failures >= 3) publish(deleted(id));
                if (unavailable) continue;
                record.retryAt =
                    Date.now() + Math.min(1_000 * 2 ** Math.min(record.failures - 1, 5), 30_000);
            }
        } finally {
            scheduleRetries();
        }
    }

    async function ensure(ids: readonly string[]): Promise<void> {
        if (options.signal.aborted) throw options.signal.reason;
        const unique = [...new Set(ids)];
        const missing: string[] = [];
        for (const id of unique) {
            let record = records.get(id);
            if (!record) {
                record = { stale: true, failures: 0 };
                records.set(id, record);
            }
            if (!record.pending && record.stale) missing.push(id);
        }
        for (let offset = 0; offset < missing.length; offset += 100) {
            const batch = missing.slice(offset, offset + 100);
            for (const id of batch) records.get(id)!.stale = false;
            // Defer the read until every member shares its in-flight promise.
            const pending = Promise.resolve()
                .then(() => fetchBatch(batch))
                .finally(() => {
                    for (const id of batch) records.get(id)!.pending = undefined;
                });
            for (const id of batch) records.get(id)!.pending = pending;
        }
        await Promise.all(unique.map((id) => records.get(id)!.pending));
        if (options.signal.aborted) throw options.signal.reason;
        // An invalidation during a read makes that response obsolete, including
        // for callers waiting to publish a message for the first time.
        if (
            unique.some((id) => {
                const record = records.get(id)!;
                return record.stale || record.pending !== undefined;
            })
        )
            await ensure(unique);
    }

    async function refresh(ids: readonly string[] = [...records.keys()]): Promise<void> {
        if (options.signal.aborted) return;
        for (const id of ids) {
            const record = records.get(id);
            if (!record) continue;
            record.retryAt = undefined;
            record.stale = true;
        }
        scheduleRetries();
        try {
            await ensure(ids.filter((id) => records.has(id)));
        } catch (error) {
            if (!options.signal.aborted) throw error;
        }
    }

    options.signal.addEventListener(
        "abort",
        () => {
            clearTimeout(retryTimer);
        },
        { once: true },
    );

    return { profiles: profiles as ReadonlyMap<string, UserProfile>, ensure, refresh };
}
