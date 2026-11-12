import {
    USER_CALENDARS,
    type ReportEnvironmentRequest,
    type UserCalendar,
    type UserDeviceKind,
    type UserHourCycle,
} from "@slopus/happy-agent-client";

/**
 * What one device tells a Happy Agent about where and how its person works. A field left out was
 * not determined and keeps what the daemon stored before; none is ever null.
 */
export type UserEnvironmentReport = Omit<ReportEnvironmentRequest, "mutationId">;

const DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/u;
const MAXIMUM_LANGUAGES = 16;
// eslint-disable-next-line no-control-regex
const NAME_PATTERN = /^[^\u0000-\u001f\u007f-\u009f]{1,64}$/u;
const HOUR_CYCLES: readonly string[] = ["h11", "h12", "h23", "h24"];

/**
 * Week info is newer than this package's ES2022 library: runtimes name it `getWeekInfo()`, and
 * earlier ones a `weekInfo` getter, while some have neither.
 */
interface LocaleWeekInfo {
    readonly getWeekInfo?: () => { readonly firstDay?: unknown };
    readonly weekInfo?: { readonly firstDay?: unknown };
}

/** Whether a deviceId is one the daemon takes. */
export function userEnvironmentDeviceIdValid(deviceId: string): boolean {
    return DEVICE_ID_PATTERN.test(deviceId);
}

/**
 * Reads this runtime's environment from `Intl`: its time zone and offset at `now`, its formatting
 * locale with that locale's clock, week, and calendar, and the preferred languages given. Anything
 * the runtime does not say, or says in a form the daemon would refuse, is left out.
 */
export function userEnvironmentReportRead(input: {
    readonly deviceId: string;
    readonly deviceKind: UserDeviceKind;
    /** The person's preferred languages, as `navigator.languages` lists them. */
    readonly languages: readonly string[];
    readonly now: Date;
}): UserEnvironmentReport {
    const resolved = new Intl.DateTimeFormat().resolvedOptions();
    const timeZone = nameOf(resolved.timeZone);
    const locale = nameOf(resolved.locale);
    const offset = -input.now.getTimezoneOffset();
    const languages = languagesOf(input.languages);
    const hourCycle =
        locale === undefined
            ? undefined
            : new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hourCycle;
    const firstDay = locale === undefined ? undefined : firstDayOf(locale);
    const calendar = resolved.calendar;
    return {
        deviceId: input.deviceId,
        deviceKind: input.deviceKind,
        // A runtime that cannot tell its zone answers `Etc/Unknown`.
        ...(timeZone === undefined || timeZone === "Etc/Unknown" ? {} : { timeZone }),
        ...(Number.isInteger(offset) && offset >= -720 && offset <= 840
            ? { utcOffsetMinutes: offset }
            : {}),
        ...(locale === undefined ? {} : { locale }),
        ...(languages.length === 0 ? {} : { languages }),
        ...(hourCycle !== undefined && HOUR_CYCLES.includes(hourCycle)
            ? { hourCycle: hourCycle as UserHourCycle }
            : {}),
        ...(firstDay === undefined ? {} : { firstDayOfWeek: firstDay }),
        // Any calendar the daemon does not list would refuse the whole report.
        ...((USER_CALENDARS as readonly string[]).includes(calendar)
            ? { calendar: calendar as UserCalendar }
            : {}),
    };
}

function nameOf(value: string | undefined): string | undefined {
    return value !== undefined && NAME_PATTERN.test(value) ? value : undefined;
}

function languagesOf(languages: readonly string[]): string[] {
    const accepted: string[] = [];
    for (const language of languages) {
        let canonical: string | undefined;
        try {
            canonical = Intl.getCanonicalLocales(language)[0];
        } catch {
            continue;
        }
        if (canonical === undefined || !NAME_PATTERN.test(canonical)) continue;
        if (accepted.includes(canonical)) continue;
        accepted.push(canonical);
        if (accepted.length === MAXIMUM_LANGUAGES) break;
    }
    return accepted;
}

function firstDayOf(locale: string): UserEnvironmentReport["firstDayOfWeek"] {
    let firstDay: unknown;
    try {
        const extended = new Intl.Locale(locale) as Intl.Locale & LocaleWeekInfo;
        firstDay = (extended.getWeekInfo?.() ?? extended.weekInfo)?.firstDay;
    } catch {
        return undefined;
    }
    return typeof firstDay === "number" &&
        Number.isInteger(firstDay) &&
        firstDay >= 1 &&
        firstDay <= 7
        ? (firstDay as UserEnvironmentReport["firstDayOfWeek"])
        : undefined;
}
