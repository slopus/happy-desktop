import {
    happyAgentSyncRead,
    type HappyAgentClient,
    type HappyAgentProviderModelTokenUsage,
    type HappyAgentProviderTokenCounts,
    type HappyAgentProviderUsageEntry,
    type HappyAgentProviderUsageReading,
    type HappyAgentProviderUsageSource,
    type HappyAgentProviderUsageWindow,
    type HappyAgentSync,
    type happyAgentProtocol,
} from "happy-desktop-state";

type DaemonUsageResponse = happyAgentProtocol.DaemonUsageResponse;
type ProviderUsageEntry = happyAgentProtocol.ProviderUsageEntry;
type ProviderUsageUpdatedPayload = happyAgentProtocol.ProviderUsageUpdatedPayload;

/** A daemon older than protocol 29 announces no usage changes, so it is read this often. */
const LEGACY_POLL_MS = 60_000;
/** Token counts move with every finished run; while followed, they are read again at most this often. */
const TOKENS_READ_MS = 10_000;
/** An account the daemon read more recently than this is not read again on request. */
const REFRESH_OLDER_THAN_MS = 300_000;
/** From protocol 36 a re-check asks the daemon to read every account it can, however recent. */
const RECHECK_FORCE_PROTOCOL_VERSION = 36;
/** An older daemon re-checks through an ordinary refresh, at the shortest age it accepts. */
const RECHECK_LEGACY_OLDER_THAN_MS = 60_000;

/**
 * What can change the usage surface: an account's reading, the configured
 * accounts themselves, and the token counts a finished run adds to.
 */
const USAGE_EVENTS: readonly happyAgentProtocol.HappyAgentEvent["type"][] = [
    "provider.usage.updated",
    "config.updated",
    "run.finished",
];

type UsageWindow = "hour" | "day" | "week" | "month";

const WINDOWS: readonly UsageWindow[] = ["hour", "day", "week", "month"];

/**
 * Follows daemon usage for as long as a surface observes it.
 *
 * Subscribing reads every account once, then applies each account's
 * `provider.usage.updated` as it arrives: every change to an account is one
 * complete replacement of its entry, so the latest one wins. The whole list is
 * read again whenever what was followed may have been missed — a new
 * bootstrap, a journal gap, a reconnect — and when the configured accounts
 * change.
 *
 * Finished runs are what move the token counts, which no account event
 * carries. Only a surface that shows them follows them, through
 * `tokensFollow`: the counts are read again when it arrives if the held ones
 * are older than `TOKENS_READ_MS`, and while it stays, finished runs prompt a
 * read at most that often. Nothing else reads the whole list for a finished
 * run, so a picker that only warns of running-out accounts costs no reads.
 *
 * A daemon older than protocol 29 sends no such events and leaves the
 * freshness fields off its entries; while one is answering, the list is read
 * every `LEGACY_POLL_MS` instead.
 */
export function happyAgentUsageSourceCreate(
    client: HappyAgentClient,
    sync: HappyAgentSync,
): HappyAgentProviderUsageSource {
    /** The last read came from a daemon without account events or the refresh route. */
    let legacy = false;
    /** How many surfaces are showing token counts now. */
    let tokensFollowers = 0;
    /** Each live subscription's way to bring stale token counts up to date. */
    const tokensStale = new Set<() => void>();
    return {
        tokensFollow() {
            tokensFollowers += 1;
            for (const catchUp of tokensStale) catchUp();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                tokensFollowers -= 1;
            };
        },
        refresh(providerIds) {
            if (legacy) return;
            // Progress and results arrive as account events. A daemon that
            // cannot refresh, or a request that fails, leaves the readings as
            // they are, which is all there is to say about it.
            void client
                .refreshProviderUsage({
                    ...(providerIds === undefined ? {} : { providerIds: [...providerIds] }),
                    olderThanMs: REFRESH_OLDER_THAN_MS,
                })
                .catch(() => undefined);
        },
        async recheck() {
            if (legacy) return;
            // An older daemon answers `force` with 400, so it is only sent to one that knows it.
            const forced = (sync.health()?.version.protocol ?? 0) >= RECHECK_FORCE_PROTOCOL_VERSION;
            await client.refreshProviderUsage(
                forced ? { force: true } : { olderThanMs: RECHECK_LEGACY_OLDER_THAN_MS },
            );
        },
        subscribe(listener) {
            const controller = new AbortController();
            const signal = controller.signal;
            /** The token windows and the account order of the last read. */
            let read: DaemonUsageResponse | undefined;
            const entries = new Map<string, ProviderUsageEntry>();
            /**
             * Each account's latest event, numbered in arrival order. A read
             * keeps any account an event changed after the read was sent: that
             * event is at least as new as what the read reports.
             */
            const changes = new Map<
                string,
                { readonly payload: ProviderUsageUpdatedPayload; readonly order: number }
            >();
            let applied = 0;
            let loadedAt: number | undefined;
            let providers: readonly HappyAgentProviderUsageEntry[] = [];
            let reading = false;
            let readAgain = false;
            let lastReadAt = 0;
            let tokensTimer: ReturnType<typeof setTimeout> | undefined;
            let pollTimer: ReturnType<typeof setInterval> | undefined;

            const publish = (): void => {
                if (read === undefined || loadedAt === undefined) return;
                providers = usageProject(read, entries, loadedAt);
                listener({ loadedAt, loading: false, providers });
            };

            const adopt = (usage: DaemonUsageResponse, sentAt: number): void => {
                read = usage;
                entries.clear();
                for (const entry of usage.providers ?? []) {
                    const change = changes.get(entry.providerId);
                    entries.set(
                        entry.providerId,
                        change !== undefined && change.order > sentAt
                            ? { ...entry, ...change.payload }
                            : entry,
                    );
                }
                legacy =
                    usage.providers === undefined ||
                    usage.providers.some((entry) => !("refreshedAt" in entry));
                if (legacy && pollTimer === undefined)
                    pollTimer = setInterval(usageRead, LEGACY_POLL_MS);
                else if (!legacy && pollTimer !== undefined) {
                    clearInterval(pollTimer);
                    pollTimer = undefined;
                }
                loadedAt = Date.now();
                publish();
            };

            /** Reads every account, retrying until it lands; one read at a time. */
            const usageRead = (): void => {
                if (signal.aborted) return;
                if (reading) {
                    readAgain = true;
                    return;
                }
                reading = true;
                const sentAt = applied;
                lastReadAt = Date.now();
                void happyAgentSyncRead(
                    signal,
                    (): Promise<DaemonUsageResponse> => client.getUsage({ signal }),
                    (error) => {
                        if (signal.aborted) return;
                        listener({
                            error: error instanceof Error ? error.message : String(error),
                            loading: false,
                            providers,
                            ...(loadedAt === undefined ? {} : { loadedAt }),
                        });
                    },
                )
                    .then((usage) => {
                        if (!signal.aborted) adopt(usage, sentAt);
                    })
                    .catch(() => undefined)
                    .finally(() => {
                        reading = false;
                        if (!readAgain) return;
                        readAgain = false;
                        usageRead();
                    });
            };

            const tokensRead = (): void => {
                if (tokensTimer !== undefined) return;
                const wait = lastReadAt + TOKENS_READ_MS - Date.now();
                if (wait <= 0) {
                    usageRead();
                    return;
                }
                tokensTimer = setTimeout(() => {
                    tokensTimer = undefined;
                    if (tokensFollowers > 0) usageRead();
                }, wait);
            };

            /** Until the first read lands, that read is the fresh one. */
            const tokensCatchUp = (): void => {
                if (read !== undefined && Date.now() - lastReadAt >= TOKENS_READ_MS) usageRead();
            };

            const changeApply = (payload: ProviderUsageUpdatedPayload): void => {
                changes.set(payload.providerId, { payload, order: (applied += 1) });
                // Before the first read lands it takes this change into account.
                if (read === undefined) return;
                const held = entries.get(payload.providerId);
                // An account the last read did not list was configured since.
                if (held === undefined) {
                    usageRead();
                    return;
                }
                entries.set(payload.providerId, { ...held, ...payload });
                publish();
            };

            const follow = async (): Promise<void> => {
                /** The feed broke since the last read, so changes may have been missed. */
                let dropped = false;
                for await (const input of sync.follow({ signal, events: USAGE_EVENTS })) {
                    if (input.kind === "error") {
                        dropped = true;
                        continue;
                    }
                    if (input.kind === "bootstrap" || input.kind === "reconcile") {
                        dropped = false;
                        usageRead();
                        continue;
                    }
                    const update = input.update;
                    if (update.kind === "disconnected" || update.kind === "state_lost") {
                        dropped = true;
                    } else if (update.kind === "connected") {
                        if (dropped) usageRead();
                        dropped = false;
                    } else if (update.kind === "event") {
                        const event = update.event;
                        if (event.type === "provider.usage.updated") changeApply(event.payload);
                        else if (event.type === "config.updated") usageRead();
                        else if (event.type === "run.finished" && tokensFollowers > 0) tokensRead();
                    }
                }
            };

            listener({ loading: true, providers });
            tokensStale.add(tokensCatchUp);
            void follow().catch(() => undefined);
            return () => {
                if (signal.aborted) return;
                tokensStale.delete(tokensCatchUp);
                controller.abort();
                clearTimeout(tokensTimer);
                clearInterval(pollTimer);
            };
        },
    };
}

function usageProject(
    usage: DaemonUsageResponse,
    entries: ReadonlyMap<string, ProviderUsageEntry>,
    capturedAt: number,
): readonly HappyAgentProviderUsageEntry[] {
    const providerIds = new Set(entries.keys());
    for (const window of WINDOWS)
        for (const providerId of Object.keys(usage[window])) providerIds.add(providerId);

    return [...providerIds].map((providerId) => {
        const provider = entries.get(providerId);
        const models = modelsProject(
            usage,
            providerId,
            provider?.models.map((model) => model.id) ?? [],
        );
        const reading = provider?.usage
            ? accountUsageProject(provider.usage, models)
            : models.length > 0
              ? { capturedAt, models }
              : undefined;
        return {
            providerId,
            ...(provider?.checkedAt == null ? {} : { checkedAt: provider.checkedAt }),
            ...(provider?.error == null ? {} : { error: provider.error }),
            ...(provider?.refreshedAt == null ? {} : { refreshedAt: provider.refreshedAt }),
            ...(provider?.refreshError == null ? {} : { refreshError: provider.refreshError }),
            ...(provider?.retryAt == null ? {} : { retryAt: provider.retryAt }),
            ...(provider?.refreshing ? { refreshing: true } : {}),
            ...(provider?.signIn === "signed_in" || provider?.signIn === "signed_out"
                ? { signIn: provider.signIn }
                : {}),
            ...(reading === undefined ? {} : { usage: reading }),
        };
    });
}

function accountUsageProject(
    usage: happyAgentProtocol.ProviderAccountUsage,
    models: readonly HappyAgentProviderModelTokenUsage[],
): HappyAgentProviderUsageReading {
    const fiveHour = windowProject(usage.windows.fiveHour);
    const weekly = windowProject(usage.windows.weekly);
    const monthly = windowProject(usage.windows.monthly);
    return {
        capturedAt: usage.capturedAt,
        exhausted: usage.exhausted,
        ...(usage.planName === null ? {} : { planName: usage.planName }),
        ...(fiveHour === undefined ? {} : { fiveHour }),
        ...(weekly === undefined ? {} : { weekly }),
        ...(monthly === undefined ? {} : { monthly }),
        ...(usage.credits === null
            ? {}
            : {
                  credits: {
                      available: usage.credits.available,
                      unlimited: usage.credits.unlimited,
                      ...(usage.credits.remainingCents === null
                          ? {}
                          : { remainingCents: usage.credits.remainingCents }),
                      ...(usage.credits.usedPercent === null
                          ? {}
                          : { usedPercent: usage.credits.usedPercent }),
                  },
              }),
        ...(models.length === 0 ? {} : { models }),
    };
}

function windowProject(
    window: happyAgentProtocol.ProviderAccountUsageWindow | null,
): HappyAgentProviderUsageWindow | undefined {
    if (window === null) return undefined;
    return {
        usedPercent: window.usedPercent,
        ...(window.resetsAt === null ? {} : { resetsAt: window.resetsAt }),
        ...(window.startsAt === null ? {} : { startsAt: window.startsAt }),
        ...(window.durationMs === null ? {} : { durationMs: window.durationMs }),
        ...(window.capturedAt === undefined ? {} : { capturedAt: window.capturedAt }),
    };
}

function modelsProject(
    usage: DaemonUsageResponse,
    providerId: string,
    configuredModelIds: readonly string[],
): readonly HappyAgentProviderModelTokenUsage[] {
    // The provider entry is the authoritative complete catalog. Rolling token
    // windows are deliberately sparse, so deriving rows from them alone hides
    // every model that has not spent tokens during the reported periods.
    const modelIds = new Set(configuredModelIds);
    for (const window of WINDOWS)
        for (const modelId of Object.keys(usage[window][providerId] ?? {})) modelIds.add(modelId);

    return [...modelIds]
        .map(
            (modelId): HappyAgentProviderModelTokenUsage => ({
                modelId,
                ...countsFor(usage.hour, providerId, modelId, "hour"),
                ...countsFor(usage.day, providerId, modelId, "day"),
                ...countsFor(usage.week, providerId, modelId, "week"),
                ...countsFor(usage.month, providerId, modelId, "month"),
            }),
        )
        .sort((left, right) => {
            // The daemon reports models keyed by an object, so their order is
            // whatever insertion produced. The account's heaviest model is the
            // one worth reading first, and the name settles a tie so the list
            // does not reshuffle between two readings that spent the same.
            const spent = monthTokens(right) - monthTokens(left);
            return spent === 0 ? left.modelId.localeCompare(right.modelId) : spent;
        });
}

/** Everything one model consumed over the widest window the daemon reports. */
function monthTokens(model: HappyAgentProviderModelTokenUsage): number {
    const counts = model.month;
    if (counts === undefined) return 0;
    return (
        counts.inputTokens + counts.outputTokens + counts.cacheReadTokens + counts.cacheWriteTokens
    );
}

function countsFor(
    usage: happyAgentProtocol.UsageBreakdown,
    providerId: string,
    modelId: string,
    window: UsageWindow,
): Partial<Record<UsageWindow, HappyAgentProviderTokenCounts>> {
    const counts = usage[providerId]?.[modelId];
    return counts === undefined ? {} : { [window]: tokenCountsProject(counts) };
}

function tokenCountsProject(counts: happyAgentProtocol.ModelUsage): HappyAgentProviderTokenCounts {
    return {
        cacheReadTokens: counts.cacheRead,
        cacheWriteTokens: counts.cacheWrite,
        inputTokens: counts.input,
        outputTokens: counts.output,
    };
}
