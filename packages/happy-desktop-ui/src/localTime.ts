import { calendarDateDiff, calendarDateOf, calendarTimeZoneLocal } from "happy-desktop-state";

/**
 * Whose clock a moment is told on. Both default to the viewer's own: the
 * locale and time zone this Desktop runs in, never the agent host's. Tests
 * and blueprints pin them so a rendering does not depend on the machine.
 */
export interface LocalTimeZone {
    readonly locale?: string;
    readonly timeZone?: string;
}

const formats = new Map<string, Intl.DateTimeFormat>();

function format(zone: LocalTimeZone, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = JSON.stringify([zone.locale ?? null, zone.timeZone ?? null, options]);
    let value = formats.get(key);
    if (value === undefined) {
        value = new Intl.DateTimeFormat(zone.locale, {
            ...options,
            ...(zone.timeZone === undefined ? {} : { timeZone: zone.timeZone }),
        });
        formats.set(key, value);
    }
    return value;
}

/** The wall-clock time alone, such as "3:40 PM" or "15:40". */
export function localClockTime(at: number, zone: LocalTimeZone = {}): string {
    return format(zone, { hour: "numeric", minute: "2-digit" }).format(at);
}

/** The short weekday, such as "Thu". */
export function localWeekdayShort(at: number, zone: LocalTimeZone = {}): string {
    return format(zone, { weekday: "short" }).format(at);
}

/** Calendar days from `now` to `at` on the viewer's calendar: 0 today, 1 tomorrow, -1 yesterday. */
export function localDaysFrom(now: number, at: number, zone: LocalTimeZone = {}): number {
    const timeZone = zone.timeZone ?? calendarTimeZoneLocal();
    return calendarDateDiff(calendarDateOf(now, timeZone), calendarDateOf(at, timeZone));
}

/** A moment today reads as its time alone; any other day leads with the short weekday. */
export function localDayTime(at: number, now: number, zone: LocalTimeZone = {}): string {
    return localDaysFrom(now, at, zone) === 0
        ? localClockTime(at, zone)
        : `${localWeekdayShort(at, zone)} ${localClockTime(at, zone)}`;
}

/**
 * When something last happened, as a chat list tells it beside a name: the
 * time alone today, the short weekday within the past week, and the short
 * numeric date before that.
 */
export function localListTime(at: number, now: number, zone: LocalTimeZone = {}): string {
    const days = localDaysFrom(now, at, zone);
    if (days === 0) return localClockTime(at, zone);
    if (days < 0 && days > -7) return localWeekdayShort(at, zone);
    return format(zone, { day: "numeric", month: "numeric" }).format(at);
}

/** The day and short month, with the year when it is not this one: "Oct 9", "Oct 9, 2024". */
export function localShortDate(at: number, now: number, zone: LocalTimeZone = {}): string {
    const sameYear =
        format(zone, { year: "numeric" }).format(at) ===
        format(zone, { year: "numeric" }).format(now);
    return format(
        zone,
        sameYear
            ? { month: "short", day: "numeric" }
            : { month: "short", day: "numeric", year: "numeric" },
    ).format(at);
}

/**
 * How long ago something happened, as a chat list tells it beside a name:
 * "now" within the minute, minutes and then hours for the past day, the short
 * weekday within the past week, and the short numeric date before that.
 */
export function localAgoTime(at: number, now: number, zone: LocalTimeZone = {}): string {
    const minutes = Math.floor(Math.max(0, now - at) / 60_000);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
    const days = localDaysFrom(now, at, zone);
    if (days > -7) return localWeekdayShort(at, zone);
    return format(zone, { day: "numeric", month: "numeric" }).format(at);
}

/**
 * The last moment, no later than `now`, at which `localAgoTime(at, ·)` turned
 * to what it reads at `now`: a whole number of minutes after `at` within the
 * hour, of hours after it within the day, and the minute itself after that,
 * where the label waits on the calendar. A surface that redraws whenever the
 * latest of these moves redraws when a label changes, and not otherwise.
 */
export function localAgoTimeChangedAt(at: number, now: number): number {
    const elapsed = Math.max(0, now - at);
    const step = elapsed < 3_600_000 ? 60_000 : elapsed < 86_400_000 ? 3_600_000 : undefined;
    return step === undefined
        ? Math.floor(now / 60_000) * 60_000
        : at + Math.floor(elapsed / step) * step;
}

/**
 * When something happens, as it reads after "until": the exact local time,
 * with a day whenever it is not today. Tomorrow says so, the rest of the coming
 * week names its weekday, and anything else, including a day already past,
 * gives the date, with the year when it is not this one. Without `now`, which
 * day is today is unknown, so the date is always given.
 */
export function localMoment(at: number, now: number | undefined, zone: LocalTimeZone = {}): string {
    const time = localClockTime(at, zone);
    const days = now === undefined ? undefined : localDaysFrom(now, at, zone);
    if (days === 0) return time;
    if (days === 1) return `tomorrow at ${time}`;
    if (days !== undefined && days > 1 && days < 7)
        return `${format(zone, { weekday: "long" }).format(at)} at ${time}`;
    const sameYear =
        now !== undefined &&
        format(zone, { year: "numeric" }).format(at) ===
            format(zone, { year: "numeric" }).format(now);
    const date = format(
        zone,
        sameYear
            ? { month: "short", day: "numeric" }
            : { month: "short", day: "numeric", year: "numeric" },
    ).format(at);
    return `${date} at ${time}`;
}
