import type { CSSProperties } from "react";
import {
    HAPPY_AGENT_CALENDAR_COUNT_LIMIT,
    HAPPY_AGENT_CALENDAR_INTERVAL_LIMIT,
    HAPPY_AGENT_CALENDAR_LOCATION_LIMIT,
    HAPPY_AGENT_CALENDAR_NOTES_LIMIT,
    HAPPY_AGENT_CALENDAR_TITLE_LIMIT,
    HAPPY_AGENT_CALENDAR_WEEKDAYS,
    calendarDateAdd,
    calendarDateValid,
    calendarDateWeekday,
    type HappyAgentCalendarEditor,
    type HappyAgentCalendarFrequency,
    type HappyAgentCalendarRecurrence,
    type HappyAgentCalendarWeekday,
} from "happy-desktop-state";
import { Button } from "../../Button";
import { Icon } from "../../Icon";
import { ScrollArea } from "../../Scrollbar";
import { SegmentedControl } from "../../SegmentedControl";
import { Select } from "../../Select";
import { Switch } from "../../Switch";
import { TextField } from "../../TextField";
import { imeCompositionHandlers, imeKeyboardEvent } from "../../imeComposition";

/** What the popover tells its owner as the reader edits the event. */
export interface HappyAgentCalendarEditorHandlers {
    readonly onTitleChange: (title: string) => void;
    readonly onAllDayChange: (allDay: boolean) => void;
    readonly onStartDateChange: (date: string) => void;
    readonly onStartMinutesChange: (minutes: number) => void;
    readonly onEndDateChange: (date: string) => void;
    readonly onEndMinutesChange: (minutes: number) => void;
    readonly onTimeZoneChange: (timeZone: string) => void;
    readonly onLocationChange: (location: string) => void;
    readonly onNotesChange: (notes: string) => void;
    readonly onRecurrenceChange: (recurrence: HappyAgentCalendarRecurrence | null) => void;
    readonly onSave: () => void;
    readonly onDelete: () => void;
    readonly onClose: () => void;
}

export interface HappyAgentCalendarEventPopoverProps extends HappyAgentCalendarEditorHandlers {
    editor: HappyAgentCalendarEditor;
    /** The time zones an event can be given, by IANA name. */
    timeZones: readonly string[];
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

const FREQUENCIES = [
    { value: "none", label: "Does not repeat" },
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "yearly", label: "Yearly" },
] as const;

const INTERVAL_UNITS = {
    daily: ["day", "days"],
    weekly: ["week", "weeks"],
    monthly: ["month", "months"],
    yearly: ["year", "years"],
} as const satisfies Record<HappyAgentCalendarFrequency, readonly [string, string]>;

/** One letter per weekday, Monday first, with its full name for the reader's assistive tech. */
const WEEKDAY_LETTERS = {
    monday: ["M", "Monday"],
    tuesday: ["T", "Tuesday"],
    wednesday: ["W", "Wednesday"],
    thursday: ["T", "Thursday"],
    friday: ["F", "Friday"],
    saturday: ["S", "Saturday"],
    sunday: ["S", "Sunday"],
} as const satisfies Record<HappyAgentCalendarWeekday, readonly [string, string]>;

function minutesText(minutes: number): string {
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function minutesParse(text: string): number | undefined {
    const match = /^(\d{2}):(\d{2})/u.exec(text);
    if (match === null) return undefined;
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    return minutes >= 0 && minutes < 1_440 ? minutes : undefined;
}

function wholeOf(text: string, low: number, high: number): number | undefined {
    if (!/^\d+$/u.test(text)) return undefined;
    return Math.min(high, Math.max(low, Number(text)));
}

/** A date chosen with the platform's own date picker, drawn as the house field. */
function CalendarDateInput(props: {
    "aria-label": string;
    value: string;
    onChange: (date: string) => void;
}) {
    return (
        <span className="happy-calendar-field" data-happy-desktop-ui="calendar-field">
            <input
                aria-label={props["aria-label"]}
                className="happy-calendar-field__input"
                onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (calendarDateValid(value)) props.onChange(value);
                }}
                type="date"
                value={props.value}
            />
        </span>
    );
}

/** A wall-clock time chosen on a 15-minute step, drawn as the house field. */
function CalendarTimeInput(props: {
    "aria-label": string;
    minutes: number;
    onChange: (minutes: number) => void;
}) {
    return (
        <span className="happy-calendar-field" data-happy-desktop-ui="calendar-field">
            <input
                aria-label={props["aria-label"]}
                className="happy-calendar-field__input"
                onChange={(event) => {
                    const minutes = minutesParse(event.currentTarget.value);
                    if (minutes !== undefined) props.onChange(minutes);
                }}
                step={900}
                type="time"
                value={minutesText(props.minutes)}
            />
        </span>
    );
}

/** A whole number in a range, drawn as the house field. */
function CalendarNumberInput(props: {
    "aria-label": string;
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
}) {
    return (
        <span
            className="happy-calendar-field"
            data-happy-desktop-ui="calendar-field"
            data-width="number"
        >
            <input
                aria-label={props["aria-label"]}
                className="happy-calendar-field__input"
                max={props.max}
                min={props.min}
                onChange={(event) => {
                    const value = wholeOf(event.currentTarget.value, props.min, props.max);
                    if (value !== undefined) props.onChange(value);
                }}
                type="number"
                value={props.value}
            />
        </span>
    );
}

/**
 * HappyAgentCalendarEventPopover — the form a calendar event is made and
 * changed in: its title, whether it is all day, when it starts and ends and in
 * which time zone, where, notes, and how it repeats, with Save and Delete.
 *
 * It holds nothing of its own. Every keystroke goes to the owner, which keeps
 * the draft and says whether it can be saved and why not. An event that is
 * one of a series says so at the top, because there is only the series to
 * change. Escape closes it without saving.
 */
export function HappyAgentCalendarEventPopover(props: HappyAgentCalendarEventPopoverProps) {
    const editor = props.editor;
    const draft = editor.draft;
    const recurrence = draft.recurrence;
    const isNew = editor.target.kind === "new";
    const startWeekday = calendarDateValid(draft.startDate)
        ? calendarDateWeekday(draft.startDate)
        : "monday";
    const frequencyChange = (value: string) => {
        if (value === "none") {
            props.onRecurrenceChange(null);
            return;
        }
        const frequency = value as HappyAgentCalendarFrequency;
        props.onRecurrenceChange({
            frequency,
            interval: recurrence?.interval ?? 1,
            weekdays: frequency === "weekly" ? (recurrence?.weekdays ?? null) : null,
            end: recurrence?.end ?? { kind: "never" },
        });
    };
    const weekdayToggle = (day: HappyAgentCalendarWeekday) => {
        if (recurrence === null) return;
        const current = recurrence.weekdays ?? [startWeekday];
        const next = current.includes(day)
            ? current.filter((entry) => entry !== day)
            : HAPPY_AGENT_CALENDAR_WEEKDAYS.filter(
                  (entry) => entry === day || current.includes(entry),
              );
        // A series falls on one day at least; the last one stays.
        if (next.length === 0) return;
        props.onRecurrenceChange({ ...recurrence, weekdays: next });
    };
    const endKindChange = (kind: string) => {
        if (recurrence === null) return;
        const end =
            kind === "until"
                ? {
                      kind: "until" as const,
                      date: calendarDateValid(draft.startDate)
                          ? calendarDateAdd(draft.startDate, 28)
                          : draft.startDate,
                  }
                : kind === "count"
                  ? { kind: "count" as const, count: 10 }
                  : { kind: "never" as const };
        props.onRecurrenceChange({ ...recurrence, end });
    };
    const unit = recurrence === null ? undefined : INTERVAL_UNITS[recurrence.frequency];
    return (
        <div
            {...imeCompositionHandlers}
            aria-label={isNew ? "New event" : "Event"}
            className={["happy-calendar-popover", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="calendar-popover"
            data-testid={props["data-testid"]}
            onKeyDown={(event) => {
                if (imeKeyboardEvent(event.nativeEvent)) return;
                if (event.key === "Escape") {
                    event.stopPropagation();
                    props.onClose();
                }
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    props.onSave();
                }
            }}
            role="dialog"
            style={props.style}
        >
            <div className="happy-calendar-popover__head">
                <TextField
                    aria-label="Title"
                    autoFocus
                    className="happy-calendar-popover__title"
                    data-testid="happy-agent-calendar-title"
                    fullWidth
                    onSubmit={props.onSave}
                    onValueChange={(value) =>
                        props.onTitleChange(value.slice(0, HAPPY_AGENT_CALENDAR_TITLE_LIMIT))
                    }
                    placeholder="(No title)"
                    size="large"
                    value={draft.title}
                />
                <Button
                    aria-label="Close"
                    icon="close"
                    iconOnly
                    onClick={props.onClose}
                    size="small"
                    variant="ghost"
                />
            </div>
            <ScrollArea
                className="happy-calendar-popover__scroll"
                viewportClassName="happy-calendar-popover__scroll-viewport"
            >
                <div className="happy-calendar-popover__body">
                    {editor.series ? (
                        <p className="happy-calendar-popover__series">
                            <Icon name="repeat" size={14} />
                            Changes all events in this series
                        </p>
                    ) : null}
                    <Switch
                        checked={draft.allDay}
                        data-testid="happy-agent-calendar-all-day"
                        label="All day"
                        onChange={props.onAllDayChange}
                        size="small"
                    />
                    <div className="happy-calendar-popover__when">
                        <span className="happy-calendar-popover__label">Starts</span>
                        <div className="happy-calendar-popover__row">
                            <CalendarDateInput
                                aria-label="Start date"
                                onChange={props.onStartDateChange}
                                value={draft.startDate}
                            />
                            {draft.allDay ? null : (
                                <CalendarTimeInput
                                    aria-label="Start time"
                                    minutes={draft.startMinutes}
                                    onChange={props.onStartMinutesChange}
                                />
                            )}
                        </div>
                        <span className="happy-calendar-popover__label">Ends</span>
                        <div className="happy-calendar-popover__row">
                            <CalendarDateInput
                                aria-label="End date"
                                onChange={props.onEndDateChange}
                                value={draft.endDate}
                            />
                            {draft.allDay ? null : (
                                <CalendarTimeInput
                                    aria-label="End time"
                                    minutes={draft.endMinutes}
                                    onChange={props.onEndMinutesChange}
                                />
                            )}
                        </div>
                        {draft.allDay ? null : (
                            <>
                                <span className="happy-calendar-popover__label">Time zone</span>
                                <Select
                                    aria-label="Time zone"
                                    fullWidth
                                    onValueChange={props.onTimeZoneChange}
                                    options={(props.timeZones.includes(draft.timeZone)
                                        ? props.timeZones
                                        : [draft.timeZone, ...props.timeZones]
                                    ).map((zone) => ({
                                        value: zone,
                                        label: zone.replaceAll("_", " "),
                                    }))}
                                    size="small"
                                    value={draft.timeZone}
                                />
                            </>
                        )}
                        <span className="happy-calendar-popover__label">Repeats</span>
                        <Select
                            aria-label="Repeats"
                            data-testid="happy-agent-calendar-frequency"
                            fullWidth
                            onValueChange={frequencyChange}
                            options={[...FREQUENCIES]}
                            size="small"
                            value={recurrence?.frequency ?? "none"}
                        />
                        {recurrence !== null && unit !== undefined ? (
                            <>
                                <span className="happy-calendar-popover__label">Every</span>
                                <div className="happy-calendar-popover__row">
                                    <CalendarNumberInput
                                        aria-label="Repeat every"
                                        max={HAPPY_AGENT_CALENDAR_INTERVAL_LIMIT}
                                        min={1}
                                        onChange={(interval) =>
                                            props.onRecurrenceChange({ ...recurrence, interval })
                                        }
                                        value={recurrence.interval}
                                    />
                                    <span className="happy-calendar-popover__unit">
                                        {recurrence.interval === 1 ? unit[0] : unit[1]}
                                    </span>
                                </div>
                                {recurrence.frequency === "weekly" ? (
                                    <>
                                        <span className="happy-calendar-popover__label">On</span>
                                        <div
                                            aria-label="Repeat on"
                                            className="happy-calendar-popover__weekdays"
                                            role="group"
                                        >
                                            {HAPPY_AGENT_CALENDAR_WEEKDAYS.map((day) => {
                                                const on = (
                                                    recurrence.weekdays ?? [startWeekday]
                                                ).includes(day);
                                                return (
                                                    <button
                                                        aria-label={WEEKDAY_LETTERS[day][1]}
                                                        aria-pressed={on}
                                                        className="happy-calendar-popover__weekday"
                                                        data-happy-desktop-ui="calendar-weekday"
                                                        key={day}
                                                        onClick={() => weekdayToggle(day)}
                                                        type="button"
                                                    >
                                                        {WEEKDAY_LETTERS[day][0]}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                ) : null}
                                <span className="happy-calendar-popover__label">Ends</span>
                                <div className="happy-calendar-popover__ends">
                                    <SegmentedControl
                                        onChange={endKindChange}
                                        segments={[
                                            { value: "never", label: "Never" },
                                            { value: "until", label: "On date" },
                                            { value: "count", label: "After" },
                                        ]}
                                        size="small"
                                        value={recurrence.end.kind}
                                    />
                                    {recurrence.end.kind === "until" ? (
                                        <CalendarDateInput
                                            aria-label="Repeat until"
                                            onChange={(date) =>
                                                props.onRecurrenceChange({
                                                    ...recurrence,
                                                    end: { kind: "until", date },
                                                })
                                            }
                                            value={recurrence.end.date}
                                        />
                                    ) : null}
                                    {recurrence.end.kind === "count" ? (
                                        <div className="happy-calendar-popover__row">
                                            <CalendarNumberInput
                                                aria-label="Number of times"
                                                max={HAPPY_AGENT_CALENDAR_COUNT_LIMIT}
                                                min={1}
                                                onChange={(count) =>
                                                    props.onRecurrenceChange({
                                                        ...recurrence,
                                                        end: { kind: "count", count },
                                                    })
                                                }
                                                value={recurrence.end.count}
                                            />
                                            <span className="happy-calendar-popover__unit">
                                                {recurrence.end.count === 1 ? "time" : "times"}
                                            </span>
                                        </div>
                                    ) : null}
                                </div>
                            </>
                        ) : null}
                    </div>
                    <TextField
                        aria-label="Location"
                        fullWidth
                        leadingIcon="location"
                        onValueChange={(value) =>
                            props.onLocationChange(
                                value.slice(0, HAPPY_AGENT_CALENDAR_LOCATION_LIMIT),
                            )
                        }
                        placeholder="Add a location"
                        size="small"
                        value={draft.location}
                    />
                    <TextField
                        aria-label="Notes"
                        fullWidth
                        multiline
                        onValueChange={(value) =>
                            props.onNotesChange(value.slice(0, HAPPY_AGENT_CALENDAR_NOTES_LIMIT))
                        }
                        placeholder="Add notes"
                        rows={3}
                        size="small"
                        value={draft.notes}
                    />
                </div>
            </ScrollArea>
            <div className="happy-calendar-popover__foot">
                {editor.problem ? (
                    <span className="happy-calendar-popover__problem" role="alert">
                        {editor.problem}
                    </span>
                ) : (
                    <span className="happy-calendar-popover__spacer" />
                )}
                {isNew ? null : (
                    <Button
                        data-testid="happy-agent-calendar-delete"
                        icon="trash"
                        onClick={props.onDelete}
                        size="small"
                        variant="ghost"
                    >
                        {editor.series ? "Delete series" : "Delete"}
                    </Button>
                )}
                <Button
                    data-testid="happy-agent-calendar-save"
                    disabled={editor.timing === undefined}
                    onClick={props.onSave}
                    size="small"
                    variant="primary"
                >
                    Save
                </Button>
            </div>
        </div>
    );
}
