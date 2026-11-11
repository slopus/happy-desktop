/*
 * The artifacts' pages, as their agents publish them, and the cover each is
 * published with (`<key>.webp`, a 1600×900 rendering of the same page, made
 * by `render.mjs`).
 *
 * A page's icons are the app's own Ionicons glyphs, drawn white by
 * `render.mjs` into `icons/<name>.png` and inlined where a page names
 * `{{icon:<name>}}`, so a page needs no font of its own.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const read = (name) => readFileSync(join(import.meta.dirname, name), "utf8");

/** The glyphs the pages draw, by Ionicons name. */
export const icons = [
    "speedometer",
    "stats-chart",
    "server",
    "bulb",
    "timer",
    "cloud-download",
    "pulse",
    "layers",
    "mail",
    "mail-open",
    "rocket",
    "sparkles",
    "people",
    "time",
    "checkmark-circle",
    "chatbubbles",
];

export const iconPath = (name) => join(import.meta.dirname, "icons", `${name}.png`);

function iconsInline(html) {
    return html.replace(/\{\{icon:([a-z-]+)\}\}/gu, (_, name) => {
        const file = iconPath(name);
        if (!existsSync(file)) return "";
        const data = readFileSync(file).toString("base64");
        return `<img alt="" src="data:image/png;base64,${data}">`;
    });
}

/** Cold sync of a fresh install, in seconds per phase, at each team size. */
const phases = [
    { name: "Task list query", colour: "var(--query)" },
    { name: "Bots and Surfaces", colour: "var(--bots)" },
    { name: "Render", colour: "var(--render)" },
];
const sizes = [
    { label: "1k", phases: [0.14, 0.09, 0.07] },
    { label: "2.5k", phases: [0.33, 0.15, 0.11] },
    { label: "5k", phases: [0.58, 0.21, 0.15] },
    { label: "10k", phases: [1.21, 0.34, 0.25], current: true },
];
/** The 10k cold sync, week by week. */
const trend = [2.61, 2.48, 2.3, 2.22, 2.05, 1.8];
const queries = [
    { name: "tasks.list", ms: 970, colour: "var(--query)" },
    { name: "task_members.list", ms: 240, colour: "var(--query)" },
    { name: "surfaces.list", ms: 190, colour: "var(--bots)" },
    { name: "bots.list", ms: 150, colour: "var(--bots)" },
];

/** The median 10k run, span by span, in seconds from the start. */
const spans = [
    { name: "tasks.list", from: 0, to: 0.97, colour: "var(--query)" },
    { name: "task_members.list", from: 0.97, to: 1.21, colour: "#a78bfa" },
    { name: "surfaces.list", from: 1.21, to: 1.4, colour: "var(--bots)" },
    { name: "bots.list", from: 1.4, to: 1.55, colour: "#7dd3fc" },
    { name: "render", from: 1.55, to: 1.8, colour: "var(--render)" },
];

const sum = (values) => values.reduce((total, value) => total + value, 0);

/** A small line of values, rising up the box. */
function sparkline(values, colour) {
    const width = 64;
    const height = 26;
    const low = Math.min(...values);
    const high = Math.max(...values);
    const points = values.map((value, index) => [
        (index / (values.length - 1)) * (width - 4) + 2,
        height - 3 - ((value - low) / (high - low)) * (height - 6),
    ]);
    const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const [lastX, lastY] = points.at(-1);
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polyline points="${line}" fill="none" stroke="${colour}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${lastX}" cy="${lastY}" r="2.6" fill="${colour}"/></svg>`;
}

function kpi({ icon, tone, label, value, unit, note, good, spark }) {
    return `<div class="kpi"><div class="top"><div class="tile ${tone}">{{icon:${icon}}}</div>${label}</div><div class="value"><b>${value}<small>${unit}</small></b>${spark ?? ""}</div><div class="note${good ? " good" : ""}">${note}</div></div>`;
}

function benchmark() {
    const current = sizes.find((size) => size.current);
    const total = sum(current.phases);
    const longest = Math.max(...sizes.map((size) => sum(size.phases)));
    const kpis = [
        kpi({
            icon: "timer",
            tone: "violet",
            label: "Cold sync",
            value: total.toFixed(2),
            unit: "s",
            note: `−${(trend.at(-2) - total).toFixed(2)} s since last week`,
            good: true,
            spark: sparkline(
                trend.map((value) => -value),
                "#a78bfa",
            ),
        }),
        kpi({
            icon: "server",
            tone: "blue",
            label: "Task list query",
            value: current.phases[0].toFixed(2),
            unit: "s",
            note: `${Math.round((current.phases[0] / total) * 100)}% of the sync`,
        }),
        kpi({
            icon: "cloud-download",
            tone: "green",
            label: "Payload",
            value: "4.2",
            unit: "MB",
            note: "10,000 tasks",
        }),
        kpi({
            icon: "pulse",
            tone: "pink",
            label: "p95",
            value: "2.31",
            unit: "s",
            note: "Slowest of 20: 2.48 s",
        }),
    ].join("");
    const legend = phases
        .map((phase) => `<span><i style="background:${phase.colour}"></i>${phase.name}</span>`)
        .join("");
    const rows = sizes
        .map(
            (size) =>
                `<div class="size${size.current ? " current" : ""}"><label>${size.label}</label><div class="track"><div class="stack" style="width:${((sum(size.phases) / longest) * 100).toFixed(1)}%">${size.phases
                    .map((value) => `<div style="flex:${value}"></div>`)
                    .join("")}</div></div><em>${sum(size.phases).toFixed(2)} s</em></div>`,
        )
        .join("");
    const slowest = Math.max(...queries.map((query) => query.ms));
    const list = queries
        .map(
            (query) =>
                `<div class="query"><code>${query.name}</code><div class="mini"><div style="width:${((query.ms / slowest) * 100).toFixed(0)}%;background:${query.colour}"></div></div><em>${query.ms} ms</em></div>`,
        )
        .join("");
    const end = spans.at(-1).to;
    const trace = [
        ...spans.map(
            (span) =>
                `<div class="span"><label>${span.name}</label><div class="lane"><div style="left:${((span.from / end) * 100).toFixed(1)}%;width:${(((span.to - span.from) / end) * 100).toFixed(1)}%;background:${span.colour}"></div></div></div>`,
        ),
        `<div class="axis">${[0, 0.6, 1.2, 1.8].map((tick) => `<span style="left:${((tick / end) * 100).toFixed(1)}%">${tick ? `${tick.toFixed(1)} s` : "0"}</span>`).join("")}</div>`,
    ].join("");
    const projected = total - 0.97 + 0.15;
    const compare = [
        { label: "now", value: total, colour: "#6f6b82" },
        { label: "indexed", value: projected, colour: "linear-gradient(90deg,#8b5cf6,#ec4899)" },
    ]
        .map(
            (entry) =>
                `<div><i style="width:${((entry.value / total) * 100).toFixed(0)}px;background:${entry.colour}"></i><b>${entry.value.toFixed(2)} s</b>${entry.label}</div>`,
        )
        .join("");
    return iconsInline(
        read("benchmark.html")
            .replace("{{KPIS}}", kpis)
            .replace("{{LEGEND}}", legend)
            .replace("{{SIZES}}", rows)
            .replace("{{QUERIES}}", list)
            .replace("{{COMPARE}}", compare)
            .replace("{{TRACE}}", trace),
    );
}

export const pages = {
    benchmark: benchmark(),
    onboarding: iconsInline(read("onboarding.html")),
    feed: iconsInline(read("feed.html")),
};

/** The cover published with a page. */
export const coverPath = (key) => join(import.meta.dirname, `${key}.webp`);
