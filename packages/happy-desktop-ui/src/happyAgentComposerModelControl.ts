import {
    happyAgentChiefOfStaffRequestText,
    happyAgentServiceName,
    type HappyAgentChiefOfStaffRequest,
    type HappyAgentMenusSnapshot,
    type HappyAgentModelOption,
    type HappyAgentModelSelection,
    type HappyAgentProviderUsageReading,
    type HappyAgentProviderUsageSnapshot,
    type HappyAgentProviderUsageStore,
    type HappyAgentProviderUsageWindow,
    type HappyAgentSessionId,
    type HappyAgentThinkingLevel,
} from "happy-desktop-state";
import type {
    ComposerModelAccount,
    ComposerModelAccountLimit,
    ComposerModelAccountNotice,
    ComposerModelAccountUsage,
    ComposerModelChoice,
    ComposerModelControlProps,
    ComposerModelService,
    ComposerModelUsage,
    ComposerModelUsageWatch,
    ComposerModelUsageWindow,
} from "./ComposerModelControl";
import { localDayTime } from "./localTime";

function choiceOf(option: HappyAgentModelOption): ComposerModelChoice {
    return {
        id: option.modelId,
        label: option.name,
        efforts: option.efforts.map((effort) => ({ id: effort.level, label: effort.label })),
        effort: option.rememberedEffort ?? option.defaultEffort,
        disabled: option.disabled,
    };
}

/**
 * The notice beside the pill for a selection whose account is not an ordinary
 * choice. An unavailable one carries the exact request it would hand the
 * Chief of Staff, so the reader sees it before asking.
 */
function accountNoticeOf(
    menus: HappyAgentMenusSnapshot,
    sessionId: HappyAgentSessionId | undefined,
    ask: ((request: HappyAgentChiefOfStaffRequest) => Promise<void>) | undefined,
): ComposerModelAccountNotice | undefined {
    if (menus.currentAccount === "hidden") return { kind: "hidden" };
    if (menus.currentAccount === "available" || ask === undefined) return undefined;
    const request: HappyAgentChiefOfStaffRequest = {
        kind: "accountUnavailable",
        providerId: menus.currentProviderId,
        modelId: menus.currentModelId,
        reason: menus.currentAccount,
        ...(sessionId === undefined ? {} : { sessionId }),
    };
    const accountName = menus.currentOption?.providerName ?? menus.currentProviderId;
    return {
        kind: "unavailable",
        explanation:
            menus.currentAccount === "disabled"
                ? `The ${accountName} account is switched off, so nothing is sent to it.`
                : `The ${accountName} account is no longer configured on this Happy Agent.`,
        request: happyAgentChiefOfStaffRequestText(request),
        onAsk: () => ask(request),
    };
}

/**
 * Maps a session menu snapshot into props for the shared composer model pill.
 *
 * Providers sharing a configured type are accounts of one service, listed in
 * catalog order. The service holding the current model opens on that model's
 * provider; any other service opens on its first account. A hidden account is
 * not listed, but a selection on it stays, named beside a grey notice; one
 * that is switched off or gone gets a red notice that can ask the Chief of
 * Staff for help. A pool lists the accounts it routes through under it, hidden
 * ones included.
 */
export function happyAgentComposerModelControlProps(
    menus: HappyAgentMenusSnapshot,
    handlers: {
        readonly onModelChange: (selection: HappyAgentModelSelection) => void;
        readonly onEffortChange: (effort?: HappyAgentThinkingLevel) => void;
        readonly disabled?: boolean;
        readonly usageWatch?: ComposerModelUsageWatch;
        /** The conversation the pill belongs to; absent before it is started. */
        readonly sessionId?: HappyAgentSessionId;
        /** Adds a request to the Chief of Staff's draft and opens it. Nothing is sent. */
        readonly onChiefOfStaffAsk?: (request: HappyAgentChiefOfStaffRequest) => Promise<void>;
        /** The Chief of Staff bot's live name, while this Happy Agent lists one. */
        readonly chiefOfStaffName?: string;
    },
): ComposerModelControlProps {
    const services: (ComposerModelService & { accounts: ComposerModelAccount[] })[] = [];
    for (const option of menus.modelOptions) {
        let service = services.find((candidate) => candidate.id === option.providerType);
        if (service === undefined) {
            service = {
                id: option.providerType,
                label: happyAgentServiceName(option.providerType),
                account: option.providerId,
                accounts: [],
            };
            services.push(service);
        }
        let account = service.accounts.find((candidate) => candidate.id === option.providerId);
        if (account === undefined) {
            account = {
                id: option.providerId,
                label: option.providerName ?? option.providerId,
                models: [],
                ...(option.poolMembers === undefined
                    ? {}
                    : {
                          members: option.poolMembers.map((member) => ({
                              id: member.providerId,
                              label: member.providerName ?? member.providerId,
                          })),
                      }),
            };
            service.accounts.push(account);
        }
        if (option.providerId === menus.currentProviderId) service.account = option.providerId;
        account.models = [...account.models, choiceOf(option)];
    }
    const listed = menus.modelOptions.some(
        (option) =>
            option.providerId === menus.currentProviderId &&
            option.modelId === menus.currentModelId,
    );
    const current = menus.currentOption;
    const accountNotice = accountNoticeOf(menus, handlers.sessionId, handlers.onChiefOfStaffAsk);
    const ask = handlers.onChiefOfStaffAsk;
    return {
        disabled: handlers.disabled,
        services,
        ...(current === undefined || listed ? {} : { selectionModel: choiceOf(current) }),
        ...(accountNotice === undefined ? {} : { accountNotice }),
        ...(handlers.chiefOfStaffName === undefined
            ? {}
            : { chiefOfStaffName: handlers.chiefOfStaffName }),
        ...(ask === undefined ? {} : { onAccountsManage: () => ask({ kind: "accountsManage" }) }),
        selection: {
            service: current?.providerType ?? menus.currentProviderId,
            account: menus.currentProviderId,
            model: menus.currentModelId,
            effort: menus.currentEffort ?? current?.defaultEffort,
        },
        usageWatch: handlers.usageWatch,
        onSelect: (selection) => {
            const effort = [...menus.modelOptions, ...(current === undefined ? [] : [current])]
                .find(
                    (option) =>
                        option.providerId === selection.account &&
                        option.modelId === selection.model,
                )
                ?.efforts.find((candidate) => candidate.level === selection.effort)?.level;
            if (
                selection.account === menus.currentProviderId &&
                selection.model === menus.currentModelId
            )
                handlers.onEffortChange(effort);
            else
                handlers.onModelChange({
                    providerId: selection.account,
                    modelId: selection.model,
                    ...(effort !== undefined ? { effort } : {}),
                });
        },
    };
}

/**
 * A reported window, its reset told in the viewer's local time. One whose reset
 * has passed is lapsed: what it says was spent belongs to the window before,
 * and it holds nothing back until a new reading says so.
 */
function usageWindow(
    label: string,
    window: HappyAgentProviderUsageWindow | undefined,
    blocking: readonly HappyAgentProviderUsageWindow[],
    now: number,
): ComposerModelUsageWindow | undefined {
    if (window === undefined) return undefined;
    const lapsed = window.resetsAt !== undefined && window.resetsAt <= now;
    return {
        label,
        usedPercent: window.usedPercent,
        ...(window.resetsAt === undefined
            ? {}
            : { resets: `${lapsed ? "reset" : "resets"} ${localDayTime(window.resetsAt, now)}` }),
        ...(window.capturedAt === undefined ? {} : { capturedAt: window.capturedAt }),
        ...(lapsed ? { lapsed: true } : blocking.includes(window) ? { blocking: true } : {}),
    };
}

/**
 * The windows holding a spent account back: every one that is full, since the
 * account stays blocked until each has started over. An account the vendor
 * blocked with no full window waits on its fullest one.
 */
function blockingWindows(reading: HappyAgentProviderUsageReading) {
    if (reading.exhausted !== true) return [];
    const windows = [reading.fiveHour, reading.weekly, reading.monthly].filter(
        (window): window is HappyAgentProviderUsageWindow => window !== undefined,
    );
    const full = windows.filter((window) => window.usedPercent >= 100);
    return full.length > 0
        ? full
        : [...windows].sort((left, right) => right.usedPercent - left.usedPercent).slice(0, 1);
}

/**
 * Whether a spent account is still held back. It is blocked until the latest
 * reset among the windows holding it, and stays blocked with no time when the
 * service gave none. Once that reset has passed, only a new reading can say
 * the account is usable again; until one arrives it is unconfirmed, never
 * usable by the clock alone.
 */
function accountLimit(
    reading: HappyAgentProviderUsageReading,
    blocking: readonly HappyAgentProviderUsageWindow[],
    now: number,
): ComposerModelAccountLimit | undefined {
    if (reading.exhausted !== true) return undefined;
    const resets = blocking.flatMap((window) =>
        window.resetsAt === undefined ? [] : [window.resetsAt],
    );
    if (resets.length === 0) return { state: "blocked" };
    const resetsAt = Math.max(...resets);
    return resetsAt > now
        ? { state: "blocked", resets: localDayTime(resetsAt, now) }
        : { state: "unconfirmed", reset: localDayTime(resetsAt, now) };
}

/**
 * Week and session windows and their freshness per provider account. An
 * account with no plan reading is left unknown, unless it is being read or its
 * read failed, which the picker says in place of its windows.
 */
export function happyAgentComposerModelUsageProject(
    snapshot: HappyAgentProviderUsageSnapshot,
    now: number,
): ReadonlyMap<string, ComposerModelAccountUsage> {
    const usage = new Map<string, ComposerModelAccountUsage>();
    for (const entry of snapshot.providers) {
        const reading = entry.usage;
        const hasPlan =
            reading !== undefined &&
            (reading.fiveHour !== undefined ||
                reading.weekly !== undefined ||
                reading.planName !== undefined);
        // A daemon before protocol 29 says when its reading was taken, not
        // when the account was last read; that is the closest it can tell.
        const updatedAt = entry.refreshedAt ?? (hasPlan ? reading.capturedAt : undefined);
        // Before protocol 29 the daemon's own failed read is the only failure there is.
        const refreshError = entry.refreshError ?? entry.error;
        const signedOut = entry.signIn === "signed_out";
        if (!hasPlan && !entry.refreshing && refreshError === undefined && !signedOut) continue;
        const blocking = hasPlan ? blockingWindows(reading) : [];
        const week = hasPlan ? usageWindow("Week", reading.weekly, blocking, now) : undefined;
        const session = hasPlan
            ? usageWindow("Session", reading.fiveHour, blocking, now)
            : undefined;
        const limit = hasPlan ? accountLimit(reading, blocking, now) : undefined;
        usage.set(entry.providerId, {
            ...(week === undefined ? {} : { week }),
            ...(session === undefined ? {} : { session }),
            ...(updatedAt === undefined ? {} : { updatedAt }),
            ...(entry.refreshing ? { refreshing: true } : {}),
            ...(refreshError === undefined ? {} : { refreshError }),
            ...(signedOut ? { signedOut: true } : {}),
            ...(limit === undefined ? {} : { limit }),
            ...(entry.retryAt !== undefined && entry.retryAt > now
                ? { retryAt: entry.retryAt }
                : {}),
        });
    }
    return usage;
}

/**
 * Ages and passed resets are told again this often while the picker is
 * mounted, so "3 min ago" keeps counting and a reset that passes is seen.
 */
const USAGE_AGE_TICK_MS = 15_000;

/**
 * Feeds the picker's accounts, and a failure card's switch, from the
 * provider-usage store. `get` projects the reading the store already holds,
 * so a surface's first frame shows it without waiting on a subscription; one
 * projection is shared by every reader of the watch and told again only when
 * the store's reading changes or the clock moves on. A subscriber is held for
 * as long as it is mounted, so the closed pill can warn of a running-out
 * account: the store follows the daemon's account changes, and the watch
 * passes on the refresh requests the picker makes as its menu opens. The
 * picker shows no token counts, so it does not follow them, and the store
 * keeps following across the remount of every conversation opened in turn
 * rather than reading again.
 */
export function happyAgentComposerModelUsageWatch(
    store: HappyAgentProviderUsageStore,
): ComposerModelUsageWatch {
    /* One entry per subscription, so a listener subscribed twice is released twice. */
    const listeners = new Set<{ readonly listener: (usage: ComposerModelUsage) => void }>();
    let held:
        | { readonly snapshot: HappyAgentProviderUsageSnapshot; readonly usage: ComposerModelUsage }
        | undefined;
    let release: (() => void) | undefined;
    const project = (snapshot: HappyAgentProviderUsageSnapshot): ComposerModelUsage => {
        const now = Date.now();
        held = {
            snapshot,
            usage: { accounts: happyAgentComposerModelUsageProject(snapshot, now), now },
        };
        return held.usage;
    };
    // A projection a tick old is told again, so a reset that passed while
    // nothing was subscribed is not shown as still ahead.
    const get = (): ComposerModelUsage => {
        const snapshot = store.get();
        return held?.snapshot === snapshot && Date.now() - held.usage.now < USAGE_AGE_TICK_MS
            ? held.usage
            : project(snapshot);
    };
    const notify = (usage: ComposerModelUsage) => {
        for (const entry of listeners) entry.listener(usage);
    };
    return {
        get,
        subscribe(listener) {
            const entry = { listener };
            listeners.add(entry);
            if (release === undefined) {
                // What subscribers were last told of, apart from what `get` has
                // projected: a reader may project a new reading before the
                // store gets round to announcing it here.
                let told = store.get();
                const unsubscribe = store.subscribe(() => {
                    const snapshot = store.get();
                    if (snapshot === told) return;
                    told = snapshot;
                    notify(get());
                });
                // A reset passing is a change of its own, so the clock projects the reading again.
                const timer = setInterval(() => notify(project(store.get())), USAGE_AGE_TICK_MS);
                release = () => {
                    clearInterval(timer);
                    unsubscribe();
                };
            }
            listener(get());
            return () => {
                if (!listeners.delete(entry) || listeners.size > 0) return;
                release?.();
                release = undefined;
            };
        },
        refresh: (accounts) => store.usageRefresh(accounts),
        recheck: () => store.usageRecheck(),
    };
}
