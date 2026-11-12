import type {
    HappyAgentDailyUsage,
    HappyAgentProviderModelTokenUsage,
    HappyAgentProviderTokenCounts,
    HappyAgentProviderUsageEntry,
    UserError,
} from "happy-desktop-state";
import { ComposerModelAccountUsageDetails } from "../../ComposerModelControl";
import { EmptyState } from "../../EmptyState";
import { happyAgentComposerModelUsageProject } from "../../happyAgentComposerModelControl";
import { UsageActivityGrid, type UsageActivityDay } from "../../UsageActivityGrid";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";
import { providerAccountName } from "./providerAccountName";

export interface HappyAgentUsageSettingsProps {
    /** Every configured provider account, in the order they should be read. */
    providers: readonly HappyAgentUsageProviderRow[];
    /** True before the first reading arrives, so "no accounts" is not claimed early. */
    loading?: boolean;
    /** The reading itself failed. Nothing is said about it: what was already read stays. */
    error?: UserError;
    /**
     * The days that spent tokens, for the activity grid. Absent where the
     * server keeps no daily history, which shows no grid at all.
     */
    history?: HappyAgentDailyUsage;
    /** Now, in milliseconds: resets and ages are told from it. Absent, no age is told. */
    currentTime?: number;
    /** The reader's role may not see the team's usage, so there is nothing to show. */
    forbidden?: boolean;
}

/** Usage joined to the authoritative provider catalog by its stable routing ID. */
export interface HappyAgentUsageProviderRow extends HappyAgentProviderUsageEntry {
    readonly name?: string;
    readonly typeName?: string;
}

/** The rolling windows a model's tokens are reported for, in the order they are read. */
const TOKEN_WINDOWS = [
    { key: "day", label: "day" },
    { key: "week", label: "week" },
    { key: "month", label: "month" },
] as const;

const TOKENS = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/**
 * The Usage category: how much of each provider account's plan is left, one
 * section per service and one row per account in it.
 *
 * An account reads the way the model menu's account list reads it: its name and
 * plan, the week and the session with when each starts over and the share left
 * as a number and a draining ring, then how current the numbers are. Under that,
 * one quiet line per model the account actually spent tokens on; a model with
 * nothing in any window is left out.
 *
 * Only what can be shown is shown. An account with neither a plan window nor
 * tokens is left out, a service with no such account loses its section, and
 * no failure is put into words: a missing reading is simply absent.
 *
 * It renders exactly what it is handed. It reads nothing and refreshes nothing:
 * the owner keeps the readings current for as long as this category is open.
 */
export function HappyAgentUsageSettings(props: HappyAgentUsageSettingsProps) {
    const providers = props.providers;
    // Without a clock, resets name their day and no age is told.
    const now = props.currentTime;
    // Failures and sign-in state are left unsaid here, and an account still
    // being read for the first time has nothing to show yet.
    const readings = providers.map(
        ({ error: _error, refreshError: _refreshError, signIn: _signIn, refreshing, ...rest }) =>
            refreshing && rest.usage !== undefined ? { ...rest, refreshing } : rest,
    );
    const usage = happyAgentComposerModelUsageProject(
        { providers: readings, loading: false },
        now ?? 0,
    );
    const history = props.history;
    const today =
        history === undefined
            ? undefined
            : now === undefined
              ? (history.days.at(-1)?.date ?? history.since)
              : localDate(now);
    const year =
        history && today
            ? activityDays(history, laterOf(history.since, dateAdd(today, -YEAR_DAYS)), today)
            : [];
    const accountTokens = new Map<string, number>();
    for (const day of history?.days ?? [])
        for (const [providerId, models] of day.providers)
            accountTokens.set(
                providerId,
                (accountTokens.get(providerId) ?? 0) +
                    [...models.values()].reduce((sum, counts) => sum + countedTokens(counts), 0),
            );
    const shown = providers.filter(
        (provider) =>
            usage.has(provider.providerId) ||
            (provider.usage?.models ?? []).some(modelUsed) ||
            (accountTokens.get(provider.providerId) ?? 0) > 0,
    );
    const yearTokens = year.reduce((sum, day) => sum + day.tokens, 0);
    if (props.forbidden)
        return (
            <EmptyState
                description="Ask a team owner or admin if you need to see what the team has spent."
                icon="lock"
                title="Your role doesn't include team usage"
            />
        );
    return (
        <>
            {year.length > 0 && yearTokens > 0 ? (
                <HappyAgentSettingsSection
                    description={activityDescription(yearTokens, year[0]!.date, history!.since)}
                    title="Activity"
                >
                    <div className="happy-agent-usage-settings__activity">
                        <UsageActivityGrid aria-label="Tokens used each day" days={year} />
                    </div>
                </HappyAgentSettingsSection>
            ) : null}
            {shown.length === 0 && yearTokens === 0 ? (
                <EmptyState
                    animation={props.loading ? "snail" : undefined}
                    description={
                        props.loading
                            ? "Reading what this machine's provider accounts have spent."
                            : "Once an account reports its plan or spends tokens, it appears here."
                    }
                    icon={props.loading ? "clock" : "zap"}
                    title={props.loading ? "Loading usage…" : "No usage yet"}
                />
            ) : (
                serviceGroups(shown, accountTokens).map(([service, accounts]) => (
                    <HappyAgentSettingsSection key={service} title={service}>
                        {accounts.map((provider) => {
                            const models = (provider.usage?.models ?? []).filter(modelUsed);
                            const month =
                                history && today
                                    ? activityDays(
                                          history,
                                          laterOf(history.since, dateAdd(today, -(MONTH_DAYS - 1))),
                                          today,
                                          provider.providerId,
                                      )
                                    : [];
                            return (
                                <section
                                    className="happy-agent-usage-settings__account"
                                    data-happy-desktop-ui="happy-agent-usage-settings-provider"
                                    data-provider={provider.providerId}
                                    key={provider.providerId}
                                >
                                    <header className="happy-agent-usage-settings__account-header">
                                        <span
                                            className="happy-agent-usage-settings__name"
                                            data-happy-desktop-ui="happy-agent-usage-settings-provider-name"
                                        >
                                            {providerAccountName(
                                                provider.providerId,
                                                provider.name,
                                            )}
                                        </span>
                                        {provider.usage?.planName ? (
                                            <span className="happy-agent-usage-settings__plan">
                                                {provider.usage.planName}
                                            </span>
                                        ) : null}
                                    </header>
                                    {month.some((day) => day.tokens > 0) ? (
                                        <UsageActivityGrid
                                            aria-label={`Tokens ${providerAccountName(provider.providerId, provider.name)} used each day`}
                                            days={month}
                                            variant="strip"
                                        />
                                    ) : null}
                                    {usage.has(provider.providerId) ? (
                                        <ComposerModelAccountUsageDetails
                                            className="happy-agent-usage-settings__details"
                                            now={now}
                                            usage={usage.get(provider.providerId)}
                                            windowsUniform
                                        />
                                    ) : null}
                                    {models.length > 0 ? (
                                        <ul
                                            aria-label="Tokens by model"
                                            className="happy-agent-usage-settings__models"
                                        >
                                            {models.map((model) => (
                                                <li
                                                    className="happy-agent-usage-settings__model"
                                                    data-happy-desktop-ui="happy-agent-usage-settings-model"
                                                    key={model.modelId}
                                                >
                                                    <span className="happy-agent-usage-settings__model-id">
                                                        {model.modelId}
                                                    </span>
                                                    <span className="happy-agent-usage-settings__model-tokens">
                                                        {modelTokens(model)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </section>
                            );
                        })}
                    </HappyAgentSettingsSection>
                ))
            )}
        </>
    );
}

/**
 * Services and their accounts, the most used first by the daily history's
 * tokens; without one, or on a tie, in the order each first appears.
 */
function serviceGroups(
    providers: readonly HappyAgentUsageProviderRow[],
    tokens: ReadonlyMap<string, number>,
) {
    const used = (provider: HappyAgentUsageProviderRow) => tokens.get(provider.providerId) ?? 0;
    const groups = new Map<string, HappyAgentUsageProviderRow[]>();
    for (const provider of [...providers].sort((left, right) => used(right) - used(left))) {
        const service = provider.typeName ?? "Other accounts";
        const group = groups.get(service);
        if (group) group.push(provider);
        else groups.set(service, [provider]);
    }
    const total = (accounts: readonly HappyAgentUsageProviderRow[]) =>
        accounts.reduce((sum, provider) => sum + used(provider), 0);
    return [...groups].sort(([, left], [, right]) => total(right) - total(left));
}

/** The year grid's days back from today, and the account strip's. */
const YEAR_DAYS = 364;
const MONTH_DAYS = 30;

const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const SINCE = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
});

/** Tokens as the grid counts them: cache reads would flatten every other day. */
function countedTokens(counts: HappyAgentProviderTokenCounts): number {
    return counts.inputTokens + counts.outputTokens + counts.cacheWriteTokens;
}

function localDate(ms: number): string {
    const date = new Date(ms);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateAdd(date: string, days: number): string {
    const day = new Date(`${date}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + days);
    return day.toISOString().slice(0, 10);
}

function laterOf(left: string, right: string): string {
    return left > right ? left : right;
}

/**
 * Every day from `from` to `today`, filling the days the history does not
 * list with nothing: a missing day after `since` is a day that spent nothing.
 */
function activityDays(
    history: HappyAgentDailyUsage,
    from: string,
    today: string,
    providerId?: string,
): UsageActivityDay[] {
    const listed = new Map(history.days.map((day) => [day.date, day]));
    const days: UsageActivityDay[] = [];
    for (let date = from; date <= today; date = dateAdd(date, 1)) {
        const models = new Map<string, number>();
        for (const [id, byModel] of listed.get(date)?.providers ?? []) {
            if (providerId !== undefined && id !== providerId) continue;
            for (const [modelId, counts] of byModel)
                models.set(modelId, (models.get(modelId) ?? 0) + countedTokens(counts));
        }
        const ranked = [...models]
            .filter(([, tokens]) => tokens > 0)
            .sort(([, left], [, right]) => right - left)
            .map(([modelId, tokens]) => ({ modelId, tokens }));
        days.push({
            date,
            tokens: ranked.reduce((sum, model) => sum + model.tokens, 0),
            models: ranked,
        });
    }
    return days;
}

/** "1.4B tokens in the last year", or since the first day known when that is later. */
function activityDescription(tokens: number, from: string, since: string): string {
    const amount = `${COMPACT.format(tokens)} tokens`;
    return from === since
        ? `${amount} since ${SINCE.format(new Date(`${since}T00:00:00Z`))}`
        : `${amount} in the last year`;
}

function tokensTotal(counts: HappyAgentProviderTokenCounts | undefined): number {
    if (counts === undefined) return 0;
    return (
        counts.inputTokens + counts.outputTokens + counts.cacheReadTokens + counts.cacheWriteTokens
    );
}

/** A model the account spent anything on, in any window. */
function modelUsed(model: HappyAgentProviderModelTokenUsage): boolean {
    return (
        tokensTotal(model.hour) +
            tokensTotal(model.day) +
            tokensTotal(model.week) +
            tokensTotal(model.month) >
        0
    );
}

/** "5.7M day · 37.4M week · 134.7M month", leaving out windows with nothing in them. */
function modelTokens(model: HappyAgentProviderModelTokenUsage): string {
    return TOKEN_WINDOWS.flatMap(({ key, label }) => {
        const total = tokensTotal(model[key]);
        return total > 0 ? [`${TOKENS.format(total)} ${label}`] : [];
    }).join(" · ");
}
