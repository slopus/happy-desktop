import type { HappyAgentProviderLogin } from "happy-desktop-state";
import { localClockTime, localDaysFrom, localShortDate } from "../../localTime";

/** The colour of the dot before an account's line: what, if anything, needs doing. */
export type HappyAgentProviderAccountTone = "off" | "danger" | "warning" | "ok" | "unknown";

/** How a Codex, Claude, or Grok account has been doing, as the daemon reports it. */
export interface HappyAgentProviderAccountActivity {
    /** Whether the account is signed in, as the latest check found; absent while unknown. */
    readonly signIn?: "signed_in" | "signed_out";
    /** The account answers on the computer's own login rather than one only Happy uses. */
    readonly systemLogin?: boolean;
    /** When an agent last ran on it, or null when none has; absent from an older daemon. */
    readonly lastUsedAt?: number | null;
    /** How its login refreshes; null without one, absent from an older daemon. */
    readonly login?: HappyAgentProviderLogin | null;
    /** When the daemon last read its usage: all an older daemon can say. */
    readonly checkedAt?: number;
}

export interface HappyAgentProviderAccountLine {
    readonly tone: HappyAgentProviderAccountTone;
    readonly text: string;
}

/** A login closer than this to running out is worth a word while refreshing fails. */
const EXPIRY_WARNING_MS = 24 * 60 * 60 * 1000;

/**
 * The one line under an account's name in the list: the first of off, needs
 * sign-in, can't refresh, or how recently it was used. The native clients
 * word it the same, so the copy here is the contract.
 */
export function happyAgentProviderAccountLine(
    enabled: boolean,
    activity: HappyAgentProviderAccountActivity,
    now: number,
): HappyAgentProviderAccountLine {
    if (!enabled) return { tone: "off", text: "Off" };
    const refreshError = activity.login?.refreshError ?? null;
    if (activity.signIn === "signed_out" || refreshError?.permanent)
        return {
            tone: "danger",
            text: refreshError
                ? `Needs sign-in since ${happyAgentProviderSince(refreshError.since, now)}`
                : "Needs sign-in",
        };
    if (refreshError) {
        const reason =
            refreshError.code ??
            (refreshError.status === null ? undefined : `HTTP ${String(refreshError.status)}`);
        const expiry = happyAgentProviderExpiryWarning(activity.login, now);
        return {
            tone: "warning",
            text: [
                "Couldn’t refresh",
                reason,
                `last tried ${happyAgentProviderAgo(refreshError.at, now)}`,
                expiry,
            ]
                .filter(Boolean)
                .join(" · "),
        };
    }
    const tone = activity.signIn === "signed_in" ? "ok" : "unknown";
    // An older daemon says neither when the account was used nor how its login refreshed.
    if (activity.lastUsedAt === undefined)
        return {
            tone,
            text:
                activity.checkedAt === undefined
                    ? activity.signIn === "signed_in"
                        ? "Signed in"
                        : "Not checked yet"
                    : `Last checked ${happyAgentProviderAgo(activity.checkedAt, now)}`,
        };
    const used =
        activity.lastUsedAt === null
            ? "Not used yet"
            : `Used ${happyAgentProviderAgo(activity.lastUsedAt, now)}`;
    const refreshedAt = activity.login?.refreshedAt ?? null;
    return {
        tone,
        text: [
            activity.systemLogin ? `System login · ${used}` : used,
            refreshedAt === null
                ? undefined
                : `refreshed ${happyAgentProviderAgo(refreshedAt, now)}`,
        ]
            .filter(Boolean)
            .join(" · "),
    };
}

/** "Login expires in 3h", while refreshing fails and the access token has under a day left. */
export function happyAgentProviderExpiryWarning(
    login: HappyAgentProviderLogin | null | undefined,
    now: number,
): string | undefined {
    if (!login?.refreshError || login.expiresAt === null) return undefined;
    const left = login.expiresAt - now;
    if (left <= 0 || left > EXPIRY_WARNING_MS) return undefined;
    return `Login expires in ${happyAgentProviderSpan(left)}`;
}

/** "just now", "4m ago", "3h ago", "2d ago", and the short date after a week. */
export function happyAgentProviderAgo(at: number, now: number): string {
    const elapsed = Math.max(0, now - at);
    const minutes = Math.floor(elapsed / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${String(minutes)}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${String(hours)}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${String(days)}d ago`;
    return localShortDate(at, now);
}

/** "in 3h", "in 12m", "in 2d", or "Expired 2d ago" once it has passed. */
export function happyAgentProviderUntil(at: number, now: number): string {
    return at > now
        ? `in ${happyAgentProviderSpan(at - now)}`
        : `Expired ${happyAgentProviderAgo(at, now)}`;
}

/** When something began: the time alone today, the short date before. */
export function happyAgentProviderSince(at: number, now: number): string {
    return localDaysFrom(now, at) === 0 ? localClockTime(at) : localShortDate(at, now);
}

function happyAgentProviderSpan(milliseconds: number): string {
    const minutes = Math.max(1, Math.floor(milliseconds / 60_000));
    if (minutes < 60) return `${String(minutes)}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${String(hours)}h`;
    return `${String(Math.floor(hours / 24))}d`;
}
