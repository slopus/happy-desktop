import { USER_CALENDARS, type ReportEnvironmentRequest } from "@slopus/happy-agent-client";

/** What a device reports to `PUT /v0/environment`, apart from the device itself. */
export type UserEnvironment = Omit<
    ReportEnvironmentRequest,
    "deviceId" | "deviceKind" | "mutationId"
>;

/**
 * This device, as a daemon that takes user environments (`capabilities.userEnvironment`) is told
 * it: reported on every connection and whenever it may have changed, and named on every send so
 * the agent is told the environment of the device the person is using.
 */
export interface UserEnvironmentSource {
    /** Generated once for this installation and kept, matching `^[A-Za-z0-9._:-]{1,64}$`. */
    readonly deviceId: string;
    readonly deviceKind: "desktop" | "web";
    readonly current: () => UserEnvironment;
    /** Calls `listener` when the time zone or languages may have changed; returns its removal. */
    readonly changes: (listener: () => void) => () => void;
}

const MAX_LANGUAGES = 16;
const NAME = /^[^\u0000-\u001f\u007f-\u009f]{1,64}$/;

/**
 * The environment `Intl` and `navigator` describe now. Anything the runtime does not say, or
 * says in a form the daemon refuses, is left out rather than guessed, so one odd value never
 * costs the whole report.
 */
export function userEnvironmentCurrent(at: Date = new Date()): UserEnvironment {
    const options = new Intl.DateTimeFormat().resolvedOptions();
    const environment: { -readonly [K in keyof UserEnvironment]: UserEnvironment[K] } = {
        utcOffsetMinutes: -at.getTimezoneOffset(),
    };
    if (NAME.test(options.timeZone)) environment.timeZone = options.timeZone;
    if (NAME.test(options.locale)) environment.locale = options.locale;
    const languages = navigator.languages.filter((language) => NAME.test(language));
    if (languages.length > 0) environment.languages = languages.slice(0, MAX_LANGUAGES);
    const hourCycle = new Intl.DateTimeFormat(options.locale, { hour: "numeric" }).resolvedOptions()
        .hourCycle;
    if (hourCycle !== undefined) environment.hourCycle = hourCycle;
    const firstDay = weekStart(options.locale);
    if (firstDay !== undefined) environment.firstDayOfWeek = firstDay;
    const calendar = USER_CALENDARS.find((id) => id === options.calendar);
    if (calendar !== undefined) environment.calendar = calendar;
    return environment;
}

/** 1 for Monday through 7 for Sunday, as `Intl.Locale` week info numbers them. */
function weekStart(locale: string): number | undefined {
    // Chromium has `getWeekInfo()`, its older builds a `weekInfo` getter; Firefox has neither.
    const tagged = new Intl.Locale(locale) as Intl.Locale & {
        getWeekInfo?: () => { firstDay?: number };
        weekInfo?: { firstDay?: number };
    };
    const firstDay = (tagged.getWeekInfo?.() ?? tagged.weekInfo)?.firstDay;
    return firstDay !== undefined && Number.isInteger(firstDay) && firstDay >= 1 && firstDay <= 7
        ? firstDay
        : undefined;
}
