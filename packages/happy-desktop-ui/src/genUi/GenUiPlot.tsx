import { useId, useState, type ReactElement } from "react";
import type { GenUiPlot as GenUiPlotNode, GenUiPlotColor } from "./genUiRender";
import { genUiChartAxis, genUiChartGrid, genUiPlotPaint as paint } from "./genUiTheme";

/*
 * A Gen UI `plot`: a chart whose scale, ticks, tick labels, legend and colours
 * the daemon has already computed. Only the drawing is the platform's. The
 * plot is laid out in CSS pixels from the measured width rather than scaled
 * from a viewBox, so axis type stays 12px and strokes stay one pixel at any
 * column width. The box reserves its height from its aspect (2:1 at 560px and
 * wider, 16:10 below) before the first measurement, so nothing below it moves
 * when the drawing arrives.
 */

function useMeasuredWidth() {
    const [width, setWidth] = useState(0);
    const measure = (element: HTMLDivElement | null) => {
        if (!element) return;
        const observer = new ResizeObserver((entries) => {
            const box = entries[0]?.contentRect;
            if (box) setWidth(Math.floor(box.width));
        });
        observer.observe(element);
        return () => observer.disconnect();
    };
    return [width, measure] as const;
}

function Swatch(props: { color: GenUiPlotColor; mark: "line" | "box" }) {
    return (
        <span
            className="gen-ui-plot__swatch"
            data-mark={props.mark}
            style={{ background: paint(props.color) }}
        />
    );
}

/* A tabular figure of the 12px UI face is close to 7px wide; the gutter is
   sized from the longest tick label so the axis never clips or floats. */
const FIGURE_WIDTH = 7;

type Axis = NonNullable<GenUiPlotNode["y"]>;

function CartesianPlot(props: { plot: GenUiPlotNode; axis: Axis; width: number }) {
    const { plot, axis, width } = props;
    const gradientId = useId();
    const height = Math.round(width >= 560 ? width / 2 : (width * 10) / 16);
    const categories = Math.max(plot.x.length, 1);
    const stacked = plot.stacked && plot.kind !== "line";
    const value = (series: number, index: number): number | null =>
        plot.series[series]?.values[index] ?? null;
    const gutter = Math.max(0, ...axis.ticks.map((tick) => tick.label.length)) * FIGURE_WIDTH + 12;
    const top = 8;
    const bottom = height - 28;
    const left = gutter;
    const right = width;
    const band = (right - left) / categories;
    const y = (v: number) => bottom - ((v - axis.min) / (axis.max - axis.min)) * (bottom - top);
    const x = (index: number) => left + band * (index + 0.5);
    /* Rules sit on the half pixel so a 1px hairline lands on one device row at 1× and two at 2×. */
    const rule = (v: number) => Math.round(y(v)) + 0.5;
    /* Bars and areas grow from zero where zero is on the scale, else from its foot. */
    const baseline = Math.max(axis.min, Math.min(0, axis.max));
    /* A mark's hover tooltip, from the value text the document formatted; none without one. */
    const valueTitle = (seriesIndex: number, index: number) => {
        const series = plot.series[seriesIndex];
        const label = series?.labels?.[index];
        return label == null ? null : (
            <title>{`${series?.name ?? ""} · ${plot.x[index] ?? ""}: ${label}`}</title>
        );
    };

    const defs: ReactElement[] = [];
    const marks: ReactElement[] = [];
    if (plot.kind === "bar") {
        const group = Math.min(band * 0.64, 96);
        const columns = stacked ? 1 : plot.series.length;
        const gap = columns > 1 ? 3 : 0;
        const barWidth = Math.max(2, (group - gap * (columns - 1)) / columns);
        for (let index = 0; index < categories; index += 1) {
            let positive = baseline;
            let negative = baseline;
            const topSeries = stacked
                ? plot.series.reduce(
                      (last, _, series) => ((value(series, index) ?? 0) !== 0 ? series : last),
                      -1,
                  )
                : -1;
            plot.series.forEach((series, seriesIndex) => {
                const v = value(seriesIndex, index);
                if (v === null) return;
                const from = stacked ? (v >= 0 ? positive : negative) : baseline;
                const to = stacked ? from + v : v;
                if (stacked) {
                    if (v >= 0) positive = to;
                    else negative = to;
                }
                const barX = stacked
                    ? x(index) - group / 2
                    : x(index) - group / 2 + seriesIndex * (barWidth + gap);
                const w = stacked ? group : barWidth;
                const y0 = y(from);
                const y1 = y(to);
                const yTop = Math.min(y0, y1);
                const h = Math.abs(y1 - y0);
                const rounded = !stacked || seriesIndex === topSeries;
                const r = rounded ? Math.min(3, w / 2, h) : 0;
                const d =
                    r > 0
                        ? `M${barX},${yTop + h}V${yTop + r}Q${barX},${yTop} ${barX + r},${yTop}H${barX + w - r}Q${barX + w},${yTop} ${barX + w},${yTop + r}V${yTop + h}Z`
                        : `M${barX},${yTop}h${w}v${h}h${-w}Z`;
                marks.push(
                    <path
                        d={d}
                        key={`bar-${seriesIndex}-${index}`}
                        style={{ fill: paint(series.color) }}
                    >
                        {valueTitle(seriesIndex, index)}
                    </path>,
                );
            });
        }
    } else {
        const base = Array.from({ length: categories }, () => baseline);
        plot.series.forEach((series, seriesIndex) => {
            const points = Array.from({ length: categories }, (_, index) => {
                const v = series.values[index] ?? null;
                const from = stacked ? (base[index] ?? baseline) : baseline;
                return v === null ? null : { index, x: x(index), from, to: stacked ? from + v : v };
            });
            if (stacked)
                points.forEach((point) => {
                    if (point) base[point.index] = point.to;
                });
            /* A gap breaks the line: each unbroken run is drawn on its own. */
            const runs: { index: number; x: number; from: number; to: number }[][] = [];
            let run: (typeof runs)[number] = [];
            for (const point of points) {
                if (point) run.push(point);
                else if (run.length > 0) {
                    runs.push(run);
                    run = [];
                }
            }
            if (run.length > 0) runs.push(run);
            const color = paint(series.color);
            const fadeId = `${gradientId}-${String(seriesIndex)}`;
            if (plot.kind === "area" && !stacked)
                defs.push(
                    <linearGradient id={fadeId} key={fadeId} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" style={{ stopColor: color, stopOpacity: 0.22 }} />
                        <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
                    </linearGradient>,
                );
            runs.forEach((segment, runIndex) => {
                const line = segment
                    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${y(point.to)}`)
                    .join("");
                if (plot.kind === "area" && segment.length > 1) {
                    const floor = [...segment]
                        .reverse()
                        .map((point) => `L${point.x},${y(point.from)}`)
                        .join("");
                    marks.push(
                        <path
                            className="gen-ui-plot__area"
                            d={`${line}${floor}Z`}
                            data-stacked={stacked ? "" : undefined}
                            key={`area-${seriesIndex}-${runIndex}`}
                            style={{ fill: stacked ? color : `url(#${fadeId})` }}
                        />,
                    );
                }
                marks.push(
                    <path
                        className="gen-ui-plot__line"
                        d={line}
                        key={`line-${seriesIndex}-${runIndex}`}
                        style={{ stroke: color }}
                    />,
                );
                /* A lone point between gaps has no line to show it, so it gets a dot. */
                if (plot.kind === "line" || segment.length === 1)
                    segment.forEach((point) =>
                        marks.push(
                            <circle
                                className="gen-ui-plot__point"
                                cx={point.x}
                                cy={y(point.to)}
                                key={`point-${seriesIndex}-${point.index}`}
                                r={3.5}
                                style={{ fill: color }}
                            >
                                {valueTitle(seriesIndex, point.index)}
                            </circle>,
                        ),
                    );
            });
        });
    }

    return (
        <svg
            aria-hidden="true"
            className="gen-ui-plot__svg"
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            width={width}
        >
            {defs.length > 0 ? <defs>{defs}</defs> : null}
            {axis.ticks.map((tick) => (
                <g key={tick.value}>
                    <line
                        className="gen-ui-plot__grid"
                        style={{ stroke: genUiChartGrid }}
                        x1={left}
                        x2={right}
                        y1={rule(tick.value)}
                        y2={rule(tick.value)}
                    />
                    <text
                        className="gen-ui-plot__tick"
                        dominantBaseline="central"
                        style={{ fill: genUiChartAxis }}
                        textAnchor="end"
                        x={left - 12}
                        y={rule(tick.value)}
                    >
                        {tick.label}
                    </text>
                </g>
            ))}
            {marks}
            {Array.from({ length: categories }, (_, index) => (
                <text
                    className="gen-ui-plot__tick"
                    key={index}
                    style={{ fill: genUiChartAxis }}
                    textAnchor="middle"
                    x={x(index)}
                    y={height - 8}
                >
                    {plot.x[index] ?? ""}
                </text>
            ))}
        </svg>
    );
}

function Donut(props: { plot: GenUiPlotNode }) {
    const { plot } = props;
    const slices = (plot.slices ?? []).filter((slice) => slice.value > 0);
    const total = slices.reduce((sum, slice) => sum + slice.value, 0);
    const size = 200;
    const outer = size / 2;
    const thickness = 28;
    const radius = outer - thickness / 2;
    const circumference = 2 * Math.PI * radius;
    /* Slices meet on a 2px seam of the surface, drawn as a gap in the stroke. */
    const seam = slices.length > 1 ? 2 : 0;
    const lengths = slices.map((slice) => (total > 0 ? (slice.value / total) * circumference : 0));
    const offsets = lengths.map((_, index) =>
        lengths.slice(0, index).reduce((sum, length) => sum + length, 0),
    );
    const legend = plot.legend ?? [];
    return (
        <div className="gen-ui-plot__donut" data-happy-desktop-ui="gen-ui-plot-donut">
            <div className="gen-ui-plot__donut-figure" style={{ width: size, height: size }}>
                <svg aria-hidden="true" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
                    <circle
                        className="gen-ui-plot__donut-track"
                        cx={outer}
                        cy={outer}
                        r={radius}
                        strokeWidth={thickness}
                    />
                    {slices.map((slice, index) => {
                        const dash = Math.max(0, (lengths[index] ?? 0) - seam);
                        return (
                            <circle
                                cx={outer}
                                cy={outer}
                                fill="none"
                                key={index}
                                r={radius}
                                strokeDasharray={`${dash} ${circumference - dash}`}
                                strokeDashoffset={-(offsets[index] ?? 0)}
                                strokeWidth={thickness}
                                style={{ stroke: paint(slice.color) }}
                                transform={`rotate(-90 ${outer} ${outer})`}
                            />
                        );
                    })}
                </svg>
                {plot.center ? (
                    <div className="gen-ui-plot__donut-total">
                        <span className="gen-ui-plot__donut-value">{plot.center.value}</span>
                        <span className="gen-ui-plot__donut-label">{plot.center.label}</span>
                    </div>
                ) : null}
            </div>
            {legend.length > 0 ? (
                <div className="gen-ui-plot__donut-legend" role="list">
                    {legend.map((row, index) => (
                        <div className="gen-ui-plot__donut-row" key={index} role="listitem">
                            <Swatch color={row.color} mark="box" />
                            <span className="gen-ui-plot__donut-name">{row.label}</span>
                            {row.value !== undefined ? (
                                <span className="gen-ui-plot__donut-amount">{row.value}</span>
                            ) : null}
                            {row.share !== undefined ? (
                                <span className="gen-ui-plot__donut-share">{row.share}</span>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export function GenUiPlot(props: { plot: GenUiPlotNode }) {
    const { plot } = props;
    const [width, measure] = useMeasuredWidth();
    const axis = plot.y;
    return (
        <figure
            aria-label={plot.summary}
            className="gen-ui-plot"
            data-happy-desktop-ui="gen-ui-plot"
            data-kind={plot.kind}
            role="img"
        >
            {plot.kind !== "donut" && plot.legend && plot.legend.length > 0 ? (
                <div className="gen-ui-plot__legend" data-happy-desktop-ui="gen-ui-plot-legend">
                    {plot.legend.map((row, index) => (
                        <span className="gen-ui-plot__legend-item" key={index}>
                            <Swatch color={row.color} mark={plot.kind === "bar" ? "box" : "line"} />
                            {row.label}
                        </span>
                    ))}
                </div>
            ) : null}
            {plot.kind === "donut" ? (
                <Donut plot={plot} />
            ) : axis ? (
                <div className="gen-ui-plot__frame" ref={measure}>
                    {width > 0 ? <CartesianPlot axis={axis} plot={plot} width={width} /> : null}
                </div>
            ) : null}
        </figure>
    );
}
