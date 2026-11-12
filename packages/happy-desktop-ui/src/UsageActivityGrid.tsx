import { useState } from "react";

/** One local day of token use, as the grid draws it. */
export interface UsageActivityDay {
    /** The local day, `YYYY-MM-DD`. */
    readonly date: string;
    /** Input, output and cache-write tokens; cache reads would flatten every other day. */
    readonly tokens: number;
    /** The models that spent the most that day, most first. */
    readonly models: readonly { readonly modelId: string; readonly tokens: number }[];
}

export interface UsageActivityGridProps {
    /** Every day from the first one known to today, oldest first, with no gaps. */
    readonly days: readonly UsageActivityDay[];
    /**
     * `year` lays the days out in week columns, Monday at the top, with month
     * and weekday labels; `strip` puts them in one row with no labels.
     */
    readonly variant?: "year" | "strip";
    readonly "aria-label": string;
}

const CELL = 10;
const GAP = 2;
const STEP = CELL + GAP;
const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""] as const;

const TOKENS = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const DAY_TEXT = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
});
const MONTH_TEXT = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

/** A `YYYY-MM-DD` as the UTC midnight that names it, so no time zone moves it a day. */
function dayOf(date: string): Date {
    return new Date(`${date}T00:00:00Z`);
}

/** Monday is 0. */
function weekdayOf(date: string): number {
    return (dayOf(date).getUTCDay() + 6) % 7;
}

/**
 * Five levels: none, then the quartiles of the days that used anything, so one
 * enormous day does not wash every other day out to the palest shade.
 */
function levelsOf(days: readonly UsageActivityDay[]): (tokens: number) => number {
    const used = days
        .map((day) => day.tokens)
        .filter((tokens) => tokens > 0)
        .sort((left, right) => left - right);
    if (used.length === 0) return () => 0;
    const at = (share: number) => used[Math.min(used.length - 1, Math.floor(share * used.length))]!;
    const cuts = [at(0.25), at(0.5), at(0.75)];
    return (tokens) => {
        if (tokens <= 0) return 0;
        if (tokens <= cuts[0]!) return 1;
        if (tokens <= cuts[1]!) return 2;
        if (tokens <= cuts[2]!) return 3;
        return 4;
    };
}

/**
 * Opens on today: the newest weeks are at the end. Module-level, so React sees
 * one ref for the grid's whole life and does not scroll it back on a re-render.
 */
function scrollToToday(element: HTMLDivElement | null): void {
    if (element) element.scrollLeft = element.scrollWidth;
}

function tokensText(tokens: number): string {
    return `${TOKENS.format(tokens)} ${tokens === 1 ? "token" : "tokens"}`;
}

/**
 * C-342 UsageActivityGrid — a GitHub-style grid of daily token use: one cell a
 * day, its shade the day's tokens against the other days shown. Only the days
 * handed to it are drawn; nothing is padded before the first.
 *
 * Hovering a cell shows its date, its total and the models that spent most
 * that day, in one bubble laid over the grid, so the grid itself never moves.
 */
export function UsageActivityGrid(props: UsageActivityGridProps) {
    // The bubble is fixed to the viewport, so a grid that scrolls sideways
    // cannot clip it; it is placed from the hovered cell's own box.
    const [hovered, setHovered] = useState<
        { readonly index: number; readonly x: number; readonly y: number } | undefined
    >();
    const variant = props.variant ?? "year";
    const days = props.days;
    const level = levelsOf(days);
    const first = days[0];
    // The year opens on its first day's weekday; the strip has no weekdays.
    const offset = variant === "year" && first ? weekdayOf(first.date) : 0;
    const position = (index: number) =>
        variant === "year"
            ? {
                  column: Math.floor((index + offset) / 7),
                  row: (index + offset) % 7,
              }
            : { column: index, row: 0 };
    const columns = days.length === 0 ? 0 : position(days.length - 1).column + 1;
    const rows = variant === "year" ? 7 : 1;
    const months =
        variant === "year"
            ? days.flatMap((day, index) => {
                  const { column } = position(index);
                  const starts = index === 0 || day.date.endsWith("-01");
                  return starts ? [{ column, label: MONTH_TEXT.format(dayOf(day.date)) }] : [];
              })
            : [];
    // A month label needs three columns of room; the earlier one gives way.
    const monthLabels = months.filter(
        (month, index) =>
            months[index + 1] === undefined || months[index + 1]!.column - month.column >= 3,
    );
    const shown = hovered === undefined ? undefined : days[hovered.index];
    return (
        <div
            className="happy-usage-activity"
            data-happy-desktop-ui="usage-activity-grid"
            data-variant={variant}
            ref={scrollToToday}
        >
            <div className="happy-usage-activity__body">
                {variant === "year" ? (
                    <div aria-hidden="true" className="happy-usage-activity__weekdays">
                        {WEEKDAY_LABELS.map((label, row) => (
                            <span key={row}>{label}</span>
                        ))}
                    </div>
                ) : null}
                <div className="happy-usage-activity__plot">
                    {variant === "year" ? (
                        <div
                            aria-hidden="true"
                            className="happy-usage-activity__months"
                            style={{ width: `${String(columns * STEP - GAP)}px` }}
                        >
                            {monthLabels.map((month) => (
                                <span
                                    key={month.column}
                                    style={{ left: `${String(month.column * STEP)}px` }}
                                >
                                    {month.label}
                                </span>
                            ))}
                        </div>
                    ) : null}
                    <div
                        aria-label={props["aria-label"]}
                        className="happy-usage-activity__cells"
                        onPointerLeave={() => setHovered(undefined)}
                        role="img"
                        style={{
                            width: `${String(columns * STEP - GAP)}px`,
                            height: `${String(rows * STEP - GAP)}px`,
                        }}
                    >
                        {days.map((day, index) => {
                            const { column, row } = position(index);
                            return (
                                <span
                                    className="happy-usage-activity__cell"
                                    data-level={level(day.tokens)}
                                    key={day.date}
                                    onPointerEnter={(event) => {
                                        const box = event.currentTarget.getBoundingClientRect();
                                        setHovered({
                                            index,
                                            x: box.left + box.width / 2,
                                            y: box.top,
                                        });
                                    }}
                                    style={{
                                        left: `${String(column * STEP)}px`,
                                        top: `${String(row * STEP)}px`,
                                    }}
                                />
                            );
                        })}
                        {shown && hovered ? (
                            <div
                                className="happy-usage-activity__bubble"
                                data-happy-desktop-ui="usage-activity-bubble"
                                data-side={
                                    hovered.x < 160
                                        ? "start"
                                        : hovered.x > window.innerWidth - 160
                                          ? "end"
                                          : undefined
                                }
                                style={{
                                    left: `${String(hovered.x)}px`,
                                    top: `${String(hovered.y)}px`,
                                }}
                            >
                                <strong>{DAY_TEXT.format(dayOf(shown.date))}</strong>
                                <span>
                                    {shown.tokens > 0 ? tokensText(shown.tokens) : "No usage"}
                                </span>
                                {shown.models.slice(0, 3).map((model) => (
                                    <span
                                        className="happy-usage-activity__bubble-model"
                                        key={model.modelId}
                                    >
                                        <span>{model.modelId}</span>
                                        <span>{TOKENS.format(model.tokens)}</span>
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
