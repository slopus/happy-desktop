/*
 * The covers teammates' agents publish with their artifacts in Activity:
 * one 1600×900 picture each, a headline of about four words set large enough
 * to read on a phone, over the one thing the artifact shows. Every title,
 * number and name is the screenplay's look-alike; none is Happy Core's.
 *
 * Each cover is drawn in the app's own type (Figtree, JetBrains Mono) and
 * dark palette, its glyphs the app's Ionicons, drawn white by `render.mjs`
 * into `icons/<name>.png`. A cover is also its artifact's page.
 *
 * The screenshot cover frames real crops of this build's sidebar, saved
 * under `shots/` from a gym still.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "../../../../..");
const fontsource = resolve(workspace, "packages/happy-desktop-ui/node_modules/@fontsource-variable");
const fontData = (path) => readFileSync(resolve(fontsource, path)).toString("base64");

/** The glyphs the covers draw, by Ionicons name. */
export const coverIcons = [
    "speedometer",
    "git-pull-request",
    "git-commit",
    "checkmark",
    "checkmark-circle",
    "alert-circle",
    "ellipse",
    "time",
    "flag",
    "shield-checkmark",
    "logo-apple",
    "logo-windows",
    "logo-tux",
    "logo-android",
    "images",
    "document-text",
    "people",
    "person",
    "key",
    "phone-portrait",
    "remove",
];

const iconFile = (name) => join(import.meta.dirname, "icons", `${name}.png`);
/** An Ionicons glyph, white, as an inline image; tinted by its parent's `--tint` mask. */
function icon(name, className = "") {
    const file = iconFile(name);
    if (!existsSync(file)) return "";
    const data = readFileSync(file).toString("base64");
    return `<i class="glyph ${className}" style="-webkit-mask-image:url(data:image/png;base64,${data})"></i>`;
}
function shot(name) {
    const file = join(import.meta.dirname, "shots", `${name}.png`);
    if (!existsSync(file)) return "";
    return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
}

const style = () => `
@font-face { font-family: Figtree; font-weight: 300 900; src: url(data:font/woff2;base64,${fontData("figtree/files/figtree-latin-wght-normal.woff2")}) format("woff2"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 100 800; src: url(data:font/woff2;base64,${fontData("jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2")}) format("woff2"); }
:root {
    color-scheme: dark;
    --ink: #f2f2f2;
    --muted: #a3a3a3;
    --faint: #6b6b6b;
    --line: rgba(255, 255, 255, 0.08);
    --card: #262626;
    --well: #1f1f1f;
    --green: #30d158;
    --orange: #ff9f0a;
    --red: #ff453a;
    --blue: #0a84ff;
    --indigo: #7d7aff;
    --purple: #bf5af2;
    --teal: #40c8e0;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
    width: 800px;
    height: 450px;
    overflow: hidden;
    padding: 36px 44px 38px;
    display: flex;
    flex-direction: column;
    gap: 22px;
    font: 500 16px/1.3 Figtree, system-ui, sans-serif;
    color: var(--ink);
    background: #1b1b1b;
    font-variant-numeric: tabular-nums;
}
.glyph {
    display: block;
    flex: none;
    width: 1em;
    height: 1em;
    background: var(--tint, currentColor);
    -webkit-mask-size: contain;
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-position: center;
}
header { display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: 17px; }
.tile {
    flex: none;
    width: 34px;
    height: 34px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    --tint: #fff;
}
header b { color: var(--ink); font-weight: 650; }
header .from { margin-left: auto; font-family: "JetBrains Mono"; font-size: 14px; color: var(--faint); }
h1 { margin: 0; font-size: 60px; line-height: 1; font-weight: 750; letter-spacing: -0.035em; }
main { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 14px; }
.row { display: flex; align-items: center; gap: 14px; }
.pill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    border-radius: 999px;
    font-size: 18px;
    font-weight: 650;
    white-space: nowrap;
}
.mono { font-family: "JetBrains Mono"; }
`;

function page({ title, kind, tint, glyph, from, body }) {
    return `<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<title>${title}</title>
<style>${style()}</style>
<body>
<header><div class="tile" style="background:var(--${tint})">${icon(glyph)}</div><b>${kind}</b>${from ? `<span class="from">${from}</span>` : ""}</header>
<h1>${title}</h1>
<main>${body}</main>
</body>
</html>`;
}

/** Entry 1: the task list's first paint, before and after the cache. */
function perf() {
    const bars = [
        { label: "Before", ms: 420, colour: "#4a4a4a" },
        { label: "Cached", ms: 140, colour: "var(--green)" },
    ];
    const rows = bars
        .map(
            (bar) => `<div class="bar">
    <span class="label">${bar.label}</span>
    <div class="lane"><div style="width:${((bar.ms / 420) * 100).toFixed(1)}%;background:${bar.colour}"></div></div>
    <span class="ms">${bar.ms} ms</span>
</div>`,
        )
        .join("");
    return page({
        title: "Task list, 3× faster",
        kind: "Benchmark",
        tint: "green",
        glyph: "speedometer",
        from: "10,000 tasks · first paint",
        body: `<style>
.bar { display: flex; align-items: center; gap: 18px; }
.bar .label { width: 92px; font-size: 22px; color: var(--muted); }
.bar .lane { flex: 1; height: 54px; border-radius: 12px; background: var(--well); overflow: hidden; display: flex; }
.bar .lane div { height: 100%; border-radius: 12px; }
.bar .ms { width: 112px; text-align: right; font-size: 30px; font-weight: 700; }
main { justify-content: center; gap: 20px; }
</style>${rows}`,
    });
}

/** Entry 4: a code review's verdict, its findings by severity, and the files it read. */
function review() {
    const counts = [
        { n: 0, label: "high", colour: "var(--red)" },
        { n: 1, label: "medium", colour: "var(--orange)" },
        { n: 2, label: "low", colour: "var(--faint)" },
    ];
    const files = [
        { path: "sync/RetryQueue.ts", added: 48, deleted: 12 },
        { path: "sync/upload.ts", added: 9, deleted: 3 },
        { path: "sync/RetryQueue.test.ts", added: 61, deleted: 0 },
    ];
    return page({
        title: "Approve, with one fix",
        kind: "Code review",
        tint: "indigo",
        glyph: "git-pull-request",
        from: "commit 7e2c91a",
        body: `<style>
.verdict { gap: 12px; }
.verdict .ok { background: color-mix(in srgb, var(--green) 18%, transparent); color: var(--green); --tint: var(--green); }
.count { display: flex; align-items: center; gap: 8px; font-size: 20px; color: var(--muted); }
.count i.dot { width: 11px; height: 11px; border-radius: 50%; }
.count b { color: var(--ink); font-weight: 700; }
.files { margin-top: 4px; border-radius: 14px; background: var(--card); padding: 6px 18px; }
.file { display: flex; align-items: center; gap: 12px; padding: 10px 0; font-size: 17px; }
.file + .file { border-top: 1px solid var(--line); }
.file .path { flex: 1; color: var(--ink); }
.file .add { color: var(--green); }
.file .del { color: var(--red); width: 44px; text-align: right; }
</style>
<div class="row verdict">
    <span class="pill ok">${icon("checkmark-circle")}Approve</span>
    ${counts.map((count) => `<span class="count"><i class="dot" style="background:${count.colour}"></i><b>${count.n}</b> ${count.label}</span>`).join('<span class="count">·</span>')}
</div>
<div class="files mono">${files
            .map(
                (file) =>
                    `<div class="file"><span class="path">${file.path}</span><span class="add">+${file.added}</span><span class="del">${file.deleted ? `−${file.deleted}` : ""}</span></div>`,
            )
            .join("")}</div>`,
    });
}

/** Entry 5: a three-part plan, two parts in. */
function progress() {
    const parts = [
        { name: "Agent sign-in", state: "Merged", colour: "var(--green)", glyph: "checkmark-circle" },
        { name: "Desktop sessions", state: "In review", colour: "var(--orange)", glyph: "time" },
        { name: "iOS server codes", state: "Next", colour: "var(--faint)", glyph: "ellipse" },
    ];
    return page({
        title: "Sign-in: 2 of 3",
        kind: "Progress report",
        tint: "blue",
        glyph: "flag",
        from: "Team Servers",
        body: `<style>
.meter { height: 14px; border-radius: 7px; background: var(--well); overflow: hidden; }
.meter div { width: 66.7%; height: 100%; border-radius: 7px; background: var(--blue); }
.parts { border-radius: 14px; background: var(--card); padding: 4px 20px; }
.part { display: flex; align-items: center; gap: 14px; padding: 13px 0; font-size: 22px; }
.part + .part { border-top: 1px solid var(--line); }
.part .glyph { font-size: 24px; }
.part .name { flex: 1; }
.part .state { font-size: 18px; color: var(--muted); }
</style>
<div class="meter"><div></div></div>
<div class="parts">${parts
            .map(
                (part) =>
                    `<div class="part" style="--tint:${part.colour}">${icon(part.glyph)}<span class="name">${part.name}</span><span class="state">${part.state}</span></div>`,
            )
            .join("")}</div>`,
    });
}

/** Entry 6: the preview's QA receipt, every step on every platform. */
function qa() {
    const platforms = [
        { name: "macOS", glyph: "logo-apple" },
        { name: "Windows", glyph: "logo-windows" },
        { name: "Linux", glyph: "logo-tux" },
    ];
    const steps = ["Install", "Sign in", "Open a team task", "Update"];
    return page({
        title: "Preview QA passes",
        kind: "QA receipt",
        tint: "green",
        glyph: "shield-checkmark",
        from: "Desktop preview",
        body: `<style>
.grid { flex: 1; display: flex; flex-direction: column; border-radius: 14px; background: var(--card); padding: 6px 22px; }
.grid .line { flex: 1; display: flex; align-items: center; }
.grid .line + .line { border-top: 1px solid var(--line); }
.grid .step { flex: 1.4; font-size: 20px; }
.grid .cell { flex: 1; display: flex; justify-content: center; align-items: center; gap: 8px; font-size: 17px; color: var(--muted); --tint: var(--muted); }
.grid .cell .glyph { font-size: 20px; }
.grid .tick { width: 30px; height: 30px; border-radius: 50%; background: color-mix(in srgb, var(--green) 20%, transparent); display: flex; align-items: center; justify-content: center; --tint: var(--green); font-size: 18px; }
</style>
<div class="grid">
    <div class="line"><span class="step"></span>${platforms.map((platform) => `<span class="cell">${icon(platform.glyph)}${platform.name}</span>`).join("")}</div>
    ${steps.map((step) => `<div class="line"><span class="step">${step}</span>${platforms.map(() => `<span class="cell"><span class="tick">${icon("checkmark")}</span></span>`).join("")}</div>`).join("")}
</div>`,
    });
}

/** Entry 8: real crops of this build's sidebar rows, read and unread. */
function screenshot() {
    const frames = [
        { label: "Read", image: shot("rows-read") },
        { label: "Unread", image: shot("rows-unread") },
    ];
    return page({
        title: "Unread dots, steadier",
        kind: "Screenshot",
        tint: "purple",
        glyph: "images",
        from: "Sidebar Unread Dots",
        body: `<style>
main { flex-direction: row; align-items: center; gap: 18px; }
.frame { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.frame span { font-size: 18px; color: var(--muted); }
.frame img { display: block; width: 100%; border-radius: 14px; border: 1px solid var(--line); }
</style>${frames.map((frame) => `<div class="frame"><span>${frame.label}</span><img alt="" src="${frame.image}"></div>`).join("")}`,
    });
}

/** Entry 10: a design draft, as the table it proposes. */
function design() {
    const columns = ["Member", "Owner", "Bot"];
    const rows = [
        { name: "Read its conversation", cells: [true, true, true] },
        { name: "Write to it", cells: [true, true, true] },
        { name: "Change its settings", cells: ["switch", true, false] },
    ];
    const cell = (value) =>
        value === true
            ? `<span class="yes">${icon("checkmark")}</span>`
            : value === false
              ? `<span class="no">${icon("remove")}</span>`
              : `<span class="switch">Owner's switch</span>`;
    return page({
        title: "Bot permissions, draft",
        kind: "Design draft",
        tint: "orange",
        glyph: "document-text",
        from: "Bot Permissions",
        body: `<style>
.table { flex: 1; display: flex; flex-direction: column; border-radius: 14px; background: var(--card); padding: 4px 22px; }
.table .line { flex: 1; display: flex; align-items: center; }
.table .line + .line { border-top: 1px solid var(--line); }
.table .head { color: var(--muted); font-size: 17px; flex: 0.8; }
.table .name { flex: 1.5; font-size: 20px; }
.table .col { flex: 1; display: flex; justify-content: center; font-size: 22px; }
.table .yes { --tint: var(--green); }
.table .no { --tint: var(--faint); }
.table .switch { font-size: 15px; color: var(--orange); padding: 4px 10px; border-radius: 999px; background: color-mix(in srgb, var(--orange) 16%, transparent); }
</style>
<div class="table">
    <div class="line head"><span class="name"></span>${columns.map((column) => `<span class="col">${column}</span>`).join("")}</div>
    ${rows.map((row) => `<div class="line"><span class="name">${row.name}</span>${row.cells.map((value) => `<span class="col">${cell(value)}</span>`).join("")}</div>`).join("")}
</div>`,
    });
}

/** Entry 11: where each phone build of the preview stands. */
function mobile() {
    const builds = [
        { name: "iOS", glyph: "logo-apple", state: "TestFlight review", colour: "var(--orange)" },
        { name: "Android", glyph: "logo-android", state: "Internal track", colour: "var(--green)" },
    ];
    return page({
        title: "Mobile preview status",
        kind: "Status",
        tint: "teal",
        glyph: "phone-portrait",
        from: "Mobile preview",
        body: `<style>
main { gap: 16px; }
.build { flex: 1; display: flex; align-items: center; gap: 18px; padding: 0 24px; border-radius: 14px; background: var(--card); font-size: 28px; font-weight: 650; }
.build .glyph { font-size: 34px; --tint: var(--ink); }
.build .name { flex: 1; }
.build .pill { font-size: 20px; }
.build .pill i.dot { width: 10px; height: 10px; border-radius: 50%; background: currentColor; }
</style>${builds
            .map(
                (build) =>
                    `<div class="build">${icon(build.glyph)}<span class="name">${build.name}</span><span class="pill" style="color:${build.colour};background:color-mix(in srgb, ${build.colour} 16%, transparent)"><i class="dot"></i>${build.state}</span></div>`,
            )
            .join("")}`,
    });
}

/** Every cover by key, with the title and summary its artifact is published under. */
export const covers = {
    perf: {
        title: "Task list, 3× faster",
        summary:
            "With 10,000 tasks, the sidebar's first paint drops from 420 ms to 140 ms by caching the list query.",
        html: perf,
    },
    review: {
        title: "Review: message retry queue",
        summary:
            "Commit 7e2c91a passes with one medium finding: a retried send can arrive twice if the upload is cut off.",
        html: review,
    },
    progress: {
        title: "Team server sign-in: progress",
        summary: "The agent's sign-in is merged. The desktop's sessions are next, then iOS server codes.",
        html: progress,
    },
    qa: {
        title: "Desktop preview: QA",
        summary: "Install, sign in, open a team task, and update, on macOS, Windows and Linux.",
        html: qa,
    },
    screenshot: {
        title: "Sidebar: steadier unread dots",
        summary: "Unread dots sit on the row's picture, so a task's name doesn't move when one appears.",
        html: screenshot,
    },
    design: {
        title: "Draft: bot permissions",
        summary:
            "Who can read, write to and change a team bot: members by default, with an owner-only switch for settings.",
        html: design,
    },
    mobile: {
        title: "Mobile preview: status",
        summary: "iOS is in TestFlight review. Android is on the internal track.",
        html: mobile,
    },
};

/** An artifact's page: its cover, drawn as the page. */
export const coverPage = (key) => covers[key].html();

/** The cover published with an artifact. */
export const coverFile = (key) => join(import.meta.dirname, "covers", `${key}.webp`);

