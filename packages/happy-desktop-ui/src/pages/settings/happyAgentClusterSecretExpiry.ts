/** The time a countdown reads, ticking on one shared timer for every row that shows it. */
export interface HappyAgentClusterSecretClock {
    /** Now, in epoch milliseconds on the reader's clock. */
    get(): number;
    subscribe(listener: () => void): () => void;
}

/** A clock that never ticks, for fixtures and anything that shows no countdown. */
export function happyAgentClusterSecretClockAt(now: number): HappyAgentClusterSecretClock {
    return { get: () => now, subscribe: () => () => undefined };
}

/** The lifetimes a person may give a new secret, in milliseconds; `never` keeps it. */
export const HAPPY_AGENT_CLUSTER_SECRET_LIFETIMES = [
    { value: "never", label: "Never", milliseconds: undefined },
    { value: "1h", label: "1 hour", milliseconds: 3_600_000 },
    { value: "1d", label: "1 day", milliseconds: 86_400_000 },
    { value: "7d", label: "7 days", milliseconds: 604_800_000 },
    { value: "30d", label: "30 days", milliseconds: 2_592_000_000 },
] as const;

export type HappyAgentClusterSecretLifetime =
    (typeof HAPPY_AGENT_CLUSTER_SECRET_LIFETIMES)[number]["value"];

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * How long until a secret is deleted, at the precision that still changes
 * while someone watches: days and hours, hours and minutes, minutes and
 * seconds, then seconds. At zero the secret reads as expired; it leaves the list with the
 * cluster's next answer, which no longer has it, not with this clock.
 */
export function happyAgentClusterSecretExpiryText(expiresAt: number, now: number): string {
    const left = expiresAt - now;
    if (left <= 0) return "Expired";
    if (left >= DAY) {
        const days = Math.floor(left / DAY);
        const hours = Math.floor((left % DAY) / HOUR);
        return `Expires in ${String(days)}d ${String(hours)}h`;
    }
    if (left >= HOUR) {
        const hours = Math.floor(left / HOUR);
        const minutes = Math.floor((left % HOUR) / MINUTE);
        return `Expires in ${String(hours)}h ${pad(minutes)}m`;
    }
    const minutes = Math.floor(left / MINUTE);
    const seconds = Math.ceil((left % MINUTE) / SECOND);
    // 59.4 s left reads 1m 00s rather than 0m 60s.
    if (seconds === 60) return `Expires in ${String(minutes + 1)}m 00s`;
    if (minutes === 0) return `Expires in ${String(seconds)}s`;
    return `Expires in ${String(minutes)}m ${pad(seconds)}s`;
}

/** Under ten minutes left: the countdown is drawn as a warning. */
export function happyAgentClusterSecretExpirySoon(expiresAt: number, now: number): boolean {
    return expiresAt - now < 10 * MINUTE;
}

/** A lifetime in seconds as words, such as "2 hours" or "30 days", for an agent's request. */
export function happyAgentClusterSecretLifetimeText(seconds: number): string {
    const unit = (count: number, word: string) =>
        `${String(count)} ${word}${count === 1 ? "" : "s"}`;
    const milliseconds = seconds * SECOND;
    if (milliseconds >= DAY && milliseconds % DAY === 0) return unit(milliseconds / DAY, "day");
    if (milliseconds >= HOUR && milliseconds % HOUR === 0) return unit(milliseconds / HOUR, "hour");
    if (milliseconds >= MINUTE) return unit(Math.round(milliseconds / MINUTE), "minute");
    return unit(seconds, "second");
}
