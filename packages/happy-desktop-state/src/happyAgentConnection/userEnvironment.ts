import { endpointUrl } from "@slopus/happy-agent-client";

/*
 * `PUT /v0/environment` is not in a published `@slopus/happy-agent-client` yet. This file is the
 * narrow stand-in: the report's types and one request, sent with the connection's own endpoint and
 * token the way the client sends every other route. Once the client ships `reportEnvironment`
 * and the send's `deviceId`, this request and the types below give way to the client's.
 */

/** What kind of device reports, as the daemon names it. */
export type UserDeviceKind = "phone" | "tablet" | "desktop" | "web";

export type UserHourCycle = "h11" | "h12" | "h23" | "h24";

/**
 * What one device tells a Happy Agent about where and how its person works. A field left out was
 * not determined and keeps what the daemon stored before; none is ever null.
 */
export interface UserEnvironmentReport {
    /** Generated once per install and kept, `^[A-Za-z0-9._:-]{1,64}$`. */
    readonly deviceId: string;
    readonly deviceKind?: UserDeviceKind;
    /** An IANA time zone, such as `Europe/Berlin`. */
    readonly timeZone?: string;
    /** Minutes east of UTC right now; advisory, the zone is what the daemon keeps. */
    readonly utcOffsetMinutes?: number;
    /** The formatting locale, a BCP 47 tag. */
    readonly locale?: string;
    /** Preferred languages, most preferred first, at most 16. */
    readonly languages?: readonly string[];
    readonly hourCycle?: UserHourCycle;
    /** 1 for Monday through 7 for Sunday. */
    readonly firstDayOfWeek?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    /** A BCP 47 calendar identifier, such as `gregory`. */
    readonly calendar?: string;
}

/** How a report went: stored, a server without the route, or anything else that went wrong. */
export type UserEnvironmentReportOutcome =
    | { readonly outcome: "reported" }
    | { readonly outcome: "unsupported"; readonly status: number }
    | { readonly outcome: "failed"; readonly detail: string };

const DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/u;
const MAXIMUM_LANGUAGES = 16;
// eslint-disable-next-line no-control-regex
const NAME_PATTERN = /^[^\u0000-\u001f\u007f-\u009f]{1,64}$/u;
const HOUR_CYCLES: readonly string[] = ["h11", "h12", "h23", "h24"];
/** The calendars the daemon accepts; any other would refuse the whole report. */
const CALENDARS: readonly string[] = [
    "buddhist",
    "chinese",
    "coptic",
    "dangi",
    "ethioaa",
    "ethiopic",
    "gregory",
    "hebrew",
    "indian",
    "islamic",
    "islamic-civil",
    "islamic-rgsa",
    "islamic-tbla",
    "islamic-umalqura",
    "iso8601",
    "japanese",
    "persian",
    "roc",
];

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
        ...(CALENDARS.includes(calendar) ? { calendar } : {}),
    };
}

/**
 * Sends one report to a Happy Agent. Never throws: a server too old for the route, or one that
 * does not serve it at all, answers 404 or 405 and is `unsupported`. A report counts as stored
 * only when the server answers with the device's record, so nothing else can be taken for it.
 */
export async function userEnvironmentReportSend(options: {
    readonly endpoint: string;
    readonly token: string;
    readonly fetch?: typeof globalThis.fetch;
    readonly report: UserEnvironmentReport;
    readonly mutationId?: string;
    readonly signal: AbortSignal;
}): Promise<UserEnvironmentReportOutcome> {
    const request = options.fetch ?? globalThis.fetch;
    let response: Response;
    try {
        response = await request(endpointUrl(options.endpoint, "v0/environment"), {
            method: "PUT",
            headers: {
                accept: "application/json",
                authorization: `Bearer ${options.token}`,
                "content-type": "application/json; charset=utf-8",
            },
            body: JSON.stringify({
                ...options.report,
                ...(options.mutationId === undefined ? {} : { mutationId: options.mutationId }),
            }),
            // As the client does: a redirect comes from something in front of the daemon.
            redirect: "manual",
            signal: options.signal,
        });
    } catch (error) {
        return { outcome: "failed", detail: error instanceof Error ? error.message : "fetch" };
    }
    if (response.status === 404 || response.status === 405)
        return { outcome: "unsupported", status: response.status };
    if (!response.ok) return { outcome: "failed", detail: `HTTP ${response.status}` };
    const body = (await response.json().catch(() => undefined)) as
        | { readonly environment?: { readonly deviceId?: unknown } }
        | undefined;
    return body?.environment?.deviceId === options.report.deviceId
        ? { outcome: "reported" }
        : { outcome: "failed", detail: "The answer named no stored environment." };
}

function nameOf(value: string | undefined): string | undefined {
    return value !== undefined && NAME_PATTERN.test(value) ? value : undefined;
}

function languagesOf(languages: readonly string[]): readonly string[] {
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
