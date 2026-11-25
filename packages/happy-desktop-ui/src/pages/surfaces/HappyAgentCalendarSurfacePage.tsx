import type { CSSProperties, ReactNode } from "react";
import type {
    HappyAgentCalendarEventId,
    HappyAgentCalendarSnapshot,
    HappyAgentCalendarTiming,
    HappyAgentCalendarView,
} from "happy-desktop-state";
import { calendarDateAdd, calendarDateOf } from "happy-desktop-state";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { SegmentedControl } from "../../SegmentedControl";
import { calendarDateLabel, calendarItemKey, type CalendarItem } from "./calendarLayout";
import {
    HappyAgentCalendarEventPopover,
    type HappyAgentCalendarEditorHandlers,
} from "./HappyAgentCalendarEventPopover";
import { HappyAgentCalendarMonthView } from "./HappyAgentCalendarMonthView";
import { HappyAgentCalendarWeekView } from "./HappyAgentCalendarWeekView";
import {
    HappyAgentSurfaceHeader,
    type HappyAgentSurfaceChatToggle,
} from "./HappyAgentSurfaceHeader";
import type { HappyAgentSurfaceView } from "./surfacePresentation";

/** The popover's width, and the gap it keeps from what it stands beside and from the page's edges. */
const POPOVER_WIDTH = 360;
const POPOVER_GAP = 8;
const POPOVER_EDGE = 16;
/** The tallest the popover is laid out at; taller content scrolls inside it. */
const POPOVER_HEIGHT = 560;

export interface HappyAgentCalendarSurfacePageProps extends HappyAgentCalendarEditorHandlers {
    /** Who else is looking at the Surface, for its header; see `HappyAgentSurfaceHeader`. */
    viewers?: ReactNode;
    surface: HappyAgentSurfaceView;
    /** The calendar as its store holds it, with this window's own changes applied. */
    calendar: HappyAgentCalendarSnapshot;
    /** Now, in epoch milliseconds; it moves the line across today and says which day is today. */
    now: number;
    /** The time zones an event can be given, by IANA name. */
    timeZones: readonly string[];
    onViewChange: (view: HappyAgentCalendarView) => void;
    onPeriodStep: (step: 1 | -1) => void;
    onTodayShow: () => void;
    /** A day's number, or its "+N more", in the month: shows that day's week. */
    onWeekShow: (date: string) => void;
    /** A click or drag on empty space: opens the popover on a new event there. */
    onDraftOpen: (timing: HappyAgentCalendarTiming) => void;
    /** A click on an occurrence: opens the popover on its event. */
    onOccurrenceOpen: (eventId: HappyAgentCalendarEventId, index: number) => void;
    /** An occurrence dragged or resized: its whole series moves by as much. */
    onOccurrenceMove: (
        eventId: HappyAgentCalendarEventId,
        index: number,
        timing: HappyAgentCalendarTiming,
    ) => void;
    /** The new event's draft dragged elsewhere while its popover is open. */
    onDraftMove: (timing: HappyAgentCalendarTiming) => void;
    onFailureDismiss: () => void;
    /** The Surface's shared chat, toggled from the header. */
    chat?: HappyAgentSurfaceChatToggle;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

/** Where the popover stands, in the page's own coordinates. */
interface PopoverPlace {
    readonly left: number;
    readonly top: number;
}

/**
 * Beside what it is for, on whichever side has room, and inside the page. The
 * popover is a fixed width and at most a fixed height, so it is placed from
 * those rather than from its own measured size.
 */
function popoverPlace(anchor: DOMRect, page: DOMRect): PopoverPlace {
    const roomRight = page.right - anchor.right - POPOVER_GAP - POPOVER_EDGE;
    const left =
        roomRight >= POPOVER_WIDTH
            ? anchor.right + POPOVER_GAP
            : anchor.left - POPOVER_GAP - POPOVER_WIDTH;
    const height = Math.min(POPOVER_HEIGHT, page.height - POPOVER_EDGE * 2);
    const top = Math.min(
        Math.max(page.top + POPOVER_EDGE, anchor.top),
        page.bottom - POPOVER_EDGE - height,
    );
    return {
        left: Math.round(
            Math.min(
                Math.max(page.left + POPOVER_EDGE, left),
                page.right - POPOVER_EDGE - POPOVER_WIDTH,
            ) - page.left,
        ),
        top: Math.round(top - page.top),
    };
}

/** The month or week shown, in words: "October 2026", or "12 – 18 Oct 2026". */
function periodLabel(calendar: HappyAgentCalendarSnapshot): string {
    if (calendar.view === "month")
        return calendarDateLabel(calendar.anchor, { month: "long", year: "numeric" });
    const first = calendar.range.firstDate;
    const last = calendarDateAdd(first, 6);
    if (first.slice(0, 7) === last.slice(0, 7))
        return `${calendarDateLabel(first, { day: "numeric" })} – ${calendarDateLabel(last, { day: "numeric", month: "short", year: "numeric" })}`;
    if (first.slice(0, 4) === last.slice(0, 4))
        return `${calendarDateLabel(first, { day: "numeric", month: "short" })} – ${calendarDateLabel(last, { day: "numeric", month: "short", year: "numeric" })}`;
    return `${calendarDateLabel(first, { day: "numeric", month: "short", year: "numeric" })} – ${calendarDateLabel(last, { day: "numeric", month: "short", year: "numeric" })}`;
}

/**
 * HappyAgentCalendarSurfacePage — one shared calendar: its header, a bar to
 * move between months or weeks and to switch between them, and the month's
 * days or the week's hours. Everything is shown in the reader's time zone.
 *
 * It never stands in for the calendar with a loader: what is held is shown,
 * every change applies at once, and the store carries it to the Happy Agent
 * in the background. A change that could not be saved, because someone else
 * changed the event first or it was refused, is said in a banner above the
 * calendar.
 *
 * A new event is made by clicking or dragging on empty space, which opens the
 * popover on a draft drawn where it would go. The popover stands beside what
 * it is for, and is placed once, when it opens, from where that was.
 */
export function HappyAgentCalendarSurfacePage(props: HappyAgentCalendarSurfacePageProps) {
    const calendar = props.calendar;
    const today = calendarDateOf(props.now, calendar.timeZone);
    const editor = calendar.editor;

    const items: CalendarItem[] = [];
    for (const occurrence of calendar.occurrences) {
        const event = calendar.events.get(occurrence.eventId);
        if (event === undefined) continue;
        // The occurrence being edited is drawn as the popover's draft would make it.
        if (
            editor?.target.kind === "occurrence" &&
            editor.target.eventId === occurrence.eventId &&
            editor.target.index === occurrence.index
        ) {
            items.push({
                occurrence:
                    editor.timing === undefined
                        ? occurrence
                        : { ...occurrence, timing: editor.timing },
                event: { ...event, title: editor.draft.title },
            });
            continue;
        }
        items.push({ occurrence, event });
    }
    // A new event is drawn where it would go while its popover is open.
    if (editor?.target.kind === "new" && editor.timing !== undefined)
        items.push({
            occurrence: { eventId: editor.target.eventId, index: 0, timing: editor.timing },
            event: {
                id: editor.target.eventId,
                surfaceId: calendar.surfaceId,
                authorUserId: null,
                title: editor.draft.title,
                notes: null,
                location: null,
                timing: editor.timing,
                recurrence: editor.draft.recurrence,
                status: "active",
                deletedAt: null,
                createdAt: 0,
                updatedAt: 0,
                version: "",
            },
        });
    const selectedKey =
        editor === undefined
            ? undefined
            : editor.target.kind === "new"
              ? calendarItemKey(editor.target.eventId, 0)
              : calendarItemKey(editor.target.eventId, editor.target.index);

    /*
     * The popover is placed once, as it mounts, beside the occurrence it is for
     * as that is drawn then: the first piece of it on screen, or the middle of
     * the page when none is. It is keyed by what it edits, so it is placed again
     * only when it is opened on something else.
     */
    const popoverRef = (element: HTMLDivElement | null) => {
        const body = element?.parentElement;
        if (!element || !body || selectedKey === undefined) return;
        const anchor = body.querySelector(`[data-calendar-item="${CSS.escape(selectedKey)}"]`);
        if (anchor === null) return;
        const place = popoverPlace(anchor.getBoundingClientRect(), body.getBoundingClientRect());
        element.style.left = `${String(place.left)}px`;
        element.style.top = `${String(place.top)}px`;
    };
    const occurrenceMove = (
        eventId: HappyAgentCalendarEventId,
        index: number,
        timing: HappyAgentCalendarTiming,
    ) => {
        if (editor?.target.kind === "new" && editor.target.eventId === eventId) {
            props.onDraftMove(timing);
            return;
        }
        props.onOccurrenceMove(eventId, index, timing);
    };

    return (
        <div
            className={["happy-agent-calendar-surface", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-calendar-surface"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <HappyAgentSurfaceHeader
                viewers={props.viewers}
                {...(props.chat ? { chat: props.chat } : {})}
                surface={props.surface}
            />
            <div className="happy-agent-calendar-surface__toolbar" role="toolbar">
                <Button
                    data-testid="happy-agent-calendar-today"
                    onClick={props.onTodayShow}
                    size="small"
                    variant="secondary"
                >
                    Today
                </Button>
                <div className="happy-agent-calendar-surface__steps">
                    <Button
                        aria-label={calendar.view === "month" ? "Previous month" : "Previous week"}
                        icon="chevron-left"
                        iconOnly
                        onClick={() => props.onPeriodStep(-1)}
                        size="small"
                        variant="ghost"
                    />
                    <Button
                        aria-label={calendar.view === "month" ? "Next month" : "Next week"}
                        icon="chevron-right"
                        iconOnly
                        onClick={() => props.onPeriodStep(1)}
                        size="small"
                        variant="ghost"
                    />
                </div>
                <h2 aria-live="polite" className="happy-agent-calendar-surface__period">
                    {periodLabel(calendar)}
                </h2>
                {calendar.truncated ? (
                    <span className="happy-agent-calendar-surface__note">
                        Too many events to show them all here
                    </span>
                ) : null}
                <SegmentedControl
                    data-testid="happy-agent-calendar-view"
                    onChange={(value) => props.onViewChange(value as HappyAgentCalendarView)}
                    segments={[
                        { value: "month", label: "Month" },
                        { value: "week", label: "Week" },
                    ]}
                    size="small"
                    value={calendar.view}
                />
            </div>
            {calendar.failure ? (
                <div className="happy-agent-calendar-surface__notice">
                    <Banner
                        data-testid="happy-agent-calendar-failure"
                        icon="alert"
                        onDismiss={props.onFailureDismiss}
                        tone="warning"
                    >
                        {calendar.failure.message}
                    </Banner>
                </div>
            ) : null}
            <div className="happy-agent-calendar-surface__body">
                {calendar.status === "missing" ? (
                    <p className="happy-agent-calendar-surface__missing">
                        This calendar is no longer on this Happy Agent.
                    </p>
                ) : calendar.view === "month" ? (
                    <HappyAgentCalendarMonthView
                        days={calendar.range.days}
                        firstDate={calendar.range.firstDate}
                        items={items}
                        month={calendar.anchor.slice(0, 7)}
                        onDayOpen={props.onWeekShow}
                        onDraftCreate={props.onDraftOpen}
                        onOccurrenceMove={occurrenceMove}
                        onOccurrenceOpen={props.onOccurrenceOpen}
                        {...(selectedKey === undefined ? {} : { selectedKey })}
                        timeZone={calendar.timeZone}
                        today={today}
                    />
                ) : (
                    <HappyAgentCalendarWeekView
                        firstDate={calendar.range.firstDate}
                        items={items}
                        now={props.now}
                        onDraftCreate={props.onDraftOpen}
                        onOccurrenceMove={occurrenceMove}
                        onOccurrenceOpen={props.onOccurrenceOpen}
                        {...(selectedKey === undefined ? {} : { selectedKey })}
                        timeZone={calendar.timeZone}
                        today={today}
                    />
                )}
                {editor === undefined ? null : (
                    <>
                        {/* A click outside the popover closes it without saving. */}
                        <div
                            aria-hidden="true"
                            className="happy-agent-calendar-surface__dismiss"
                            onPointerDown={props.onClose}
                        />
                        <div
                            className="happy-agent-calendar-surface__popover"
                            // The popover remounts for each event, so its first field
                            // takes the caret and a new draft starts at its top.
                            key={selectedKey}
                            ref={popoverRef}
                        >
                            <HappyAgentCalendarEventPopover
                                data-testid="happy-agent-calendar-popover"
                                editor={editor}
                                onAllDayChange={props.onAllDayChange}
                                onClose={props.onClose}
                                onDelete={props.onDelete}
                                onEndDateChange={props.onEndDateChange}
                                onEndMinutesChange={props.onEndMinutesChange}
                                onLocationChange={props.onLocationChange}
                                onNotesChange={props.onNotesChange}
                                onRecurrenceChange={props.onRecurrenceChange}
                                onSave={props.onSave}
                                onStartDateChange={props.onStartDateChange}
                                onStartMinutesChange={props.onStartMinutesChange}
                                onTimeZoneChange={props.onTimeZoneChange}
                                onTitleChange={props.onTitleChange}
                                timeZones={props.timeZones}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
