import {
    agentAuthor,
    happyAgentOwnerAuthor,
    mediaLayoutProject,
    type ConversationAuthor,
    type ConversationEntry,
    type ConversationMediaItem,
    type ConversationMediaLayout,
    type ConversationMediaLayoutNode,
    type ConversationToolCall,
} from "happy-desktop-state";
import {
    mediaAspectRecordings,
    mediaDesktopRecording,
    mediaPhoneInbox,
    mediaPhoneProfile,
    mediaPhoneSettings,
} from "./conversationMediaFixtures";
import { happyAgentExplorationTool } from "./happyAgentChatFixtures";

/*
 * Deterministic, offline pictures for the media layouts: screenshots of the
 * shapes agents actually read (a desktop window, a header strip, a narrow
 * sidebar crop, an onboarding screen), and generated art. Every one is an
 * inline SVG, so a capture never waits on the network.
 */
function svg(width: number, height: number, body: string): string {
    return `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}">${body}</svg>`,
    )}`;
}

const TEXT = `font-family="Helvetica, Arial, sans-serif"`;

function item(
    name: string,
    width: number,
    height: number,
    url: string,
    size = 380_000,
    scale?: number,
): ConversationMediaItem {
    return {
        kind: "image",
        name,
        mimeType: "image/png",
        size,
        width,
        height,
        ...(scale === undefined ? {} : { scale }),
        url,
    };
}

/** A 16:10 desktop window: sidebar, toolbar, a chart, and cards. */
function dashboard(accent: string, title: string): string {
    const bars = Array.from(
        { length: 12 },
        (_, index) =>
            `<rect x="${String(340 + index * 58)}" y="${String(520 - ((index * 37) % 220))}" width="36" height="${String(80 + ((index * 37) % 220))}" rx="6" fill="${index % 4 === 1 ? accent : "#3a4152"}"/>`,
    ).join("");
    const nav = Array.from(
        { length: 9 },
        (_, index) =>
            `<rect x="28" y="${String(120 + index * 52)}" width="${String(180 - (index % 3) * 30)}" height="20" rx="10" fill="${index === 2 ? accent : "#323846"}"/>`,
    ).join("");
    return svg(
        1440,
        900,
        `<rect width="1440" height="900" fill="#171a21"/>
         <rect width="260" height="900" fill="#1f232c"/>
         <rect x="260" width="1180" height="72" fill="#1d2129"/>
         <circle cx="34" cy="36" r="9" fill="#ff5f57"/><circle cx="62" cy="36" r="9" fill="#febc2e"/><circle cx="90" cy="36" r="9" fill="#28c840"/>
         <text x="300" y="46" ${TEXT} font-size="26" font-weight="700" fill="#e8ebf2">${title}</text>
         <rect x="1220" y="20" width="180" height="34" rx="17" fill="${accent}"/>
         ${nav}
         <rect x="300" y="110" width="760" height="460" rx="18" fill="#1f232c"/>
         ${bars}
         <rect x="1090" y="110" width="310" height="210" rx="18" fill="#1f232c"/>
         <text x="1120" y="170" ${TEXT} font-size="20" fill="#9aa3b5">Active agents</text>
         <text x="1120" y="250" ${TEXT} font-size="64" font-weight="700" fill="#e8ebf2">128</text>
         <rect x="1090" y="350" width="310" height="220" rx="18" fill="${accent}" opacity="0.85"/>
         <rect x="300" y="610" width="1100" height="250" rx="18" fill="#1f232c"/>
         <rect x="330" y="650" width="520" height="18" rx="9" fill="#3a4152"/>
         <rect x="330" y="700" width="980" height="18" rx="9" fill="#323846"/>
         <rect x="330" y="750" width="860" height="18" rx="9" fill="#323846"/>
         <rect x="330" y="800" width="700" height="18" rx="9" fill="#323846"/>`,
    );
}

/** A 7:1 header strip, the screenshot a messenger mosaic cuts in half. */
const headerStrip = svg(
    1400,
    200,
    `<rect width="1400" height="200" fill="#ffffff"/>
     <rect y="198" width="1400" height="2" fill="#e5e7eb"/>
     <circle cx="80" cy="100" r="34" fill="#2baccc"/>
     <text x="134" y="114" ${TEXT} font-size="40" font-weight="700" fill="#111827">Happy</text>
     <text x="420" y="112" ${TEXT} font-size="26" fill="#374151">Chats</text>
     <text x="540" y="112" ${TEXT} font-size="26" fill="#374151">Agents</text>
     <text x="670" y="112" ${TEXT} font-size="26" fill="#374151">Files</text>
     <rect x="780" y="70" width="330" height="60" rx="30" fill="#f3f4f6"/>
     <text x="820" y="111" ${TEXT} font-size="24" fill="#9ca3af">Search…</text>
     <rect x="1150" y="66" width="150" height="68" rx="34" fill="#111827"/>
     <text x="1186" y="111" ${TEXT} font-size="26" font-weight="700" fill="#ffffff">Share</text>
     <circle cx="1346" cy="100" r="30" fill="#f472b6"/>`,
);

/** A 1:3 crop of a phone-width sidebar. */
const narrowCrop = svg(
    300,
    900,
    `<rect width="300" height="900" fill="#f8fafc"/>
     <rect x="20" y="24" width="180" height="28" rx="14" fill="#0f172a"/>
     ${Array.from(
         { length: 11 },
         (_, index) =>
             `<rect x="20" y="${String(90 + index * 72)}" width="260" height="56" rx="12" fill="${index === 3 ? "#2baccc" : "#e2e8f0"}"/>
              <circle cx="48" cy="${String(118 + index * 72)}" r="14" fill="${index === 3 ? "#ffffff" : "#94a3b8"}"/>
              <rect x="74" y="${String(110 + index * 72)}" width="${String(150 - (index % 3) * 30)}" height="16" rx="8" fill="${index === 3 ? "#ffffff" : "#64748b"}"/>`,
     ).join("")}`,
);

/** An onboarding screen over a sky, like the pair in the layout complaint. */
function onboarding(width: number, height: number, title: string, action: string): string {
    const clouds = Array.from({ length: 14 }, (_, index) => {
        const x = (index * 397) % width;
        const y = height * 0.55 + ((index * 131) % (height * 0.4));
        return `<ellipse cx="${String(x)}" cy="${String(y)}" rx="${String(220 + (index % 4) * 70)}" ry="${String(70 + (index % 3) * 26)}" fill="#ffffff" opacity="${String(0.35 + (index % 3) * 0.15)}"/>`;
    }).join("");
    const cx = width / 2;
    return svg(
        width,
        height,
        `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0" stop-color="#1c3f86"/><stop offset="0.6" stop-color="#3f74c4"/><stop offset="1" stop-color="#9dc2ea"/>
         </linearGradient></defs>
         <rect width="${String(width)}" height="${String(height)}" fill="url(#sky)"/>
         ${clouds}
         <text x="${String(cx)}" y="${String(height * 0.43)}" text-anchor="middle" ${TEXT} font-size="${String(height * 0.045)}" font-weight="700" fill="#ffffff">${title}</text>
         <text x="${String(cx)}" y="${String(height * 0.49)}" text-anchor="middle" ${TEXT} font-size="${String(height * 0.018)}" fill="#e5edff">Happy Agent uses this for your work and shared messages.</text>
         <rect x="${String(cx - width * 0.12)}" y="${String(height * 0.6)}" width="${String(width * 0.24)}" height="${String(height * 0.05)}" rx="${String(height * 0.025)}" fill="#ffffff"/>
         <text x="${String(cx)}" y="${String(height * 0.633)}" text-anchor="middle" ${TEXT} font-size="${String(height * 0.02)}" font-weight="700" fill="#111827">${action}</text>`,
    );
}

/** Generated art: banded hills under a sun, in one palette per picture. */
function art(width: number, height: number, sky: string, sun: string, hills: readonly string[]) {
    const bands = hills
        .map((fill, index) => {
            const base = height * (0.5 + index * 0.13);
            return `<path d="M0 ${String(base)} C ${String(width * 0.25)} ${String(base - height * 0.12)}, ${String(width * 0.6)} ${String(base + height * 0.1)}, ${String(width)} ${String(base - height * 0.05)} L ${String(width)} ${String(height)} L 0 ${String(height)} Z" fill="${fill}"/>`;
        })
        .join("");
    return svg(
        width,
        height,
        `<rect width="${String(width)}" height="${String(height)}" fill="${sky}"/>
         <circle cx="${String(width * 0.68)}" cy="${String(height * 0.3)}" r="${String(Math.min(width, height) * 0.14)}" fill="${sun}"/>
         ${bands}`,
    );
}

export const readWide = item("onboarding-desktop.png", 1440, 900, dashboard("#5b8cff", "Overview"));
export const readFlat = item("header-strip.png", 1400, 200, headerStrip);
export const readNarrow = item("sidebar-crop.png", 300, 900, narrowCrop);
export const readWideSecond = item(
    "settings-models.png",
    1440,
    900,
    dashboard("#34c38f", "Models"),
);
export const readTall = item(
    "full-page-capture.png",
    1440,
    7200,
    svg(
        1440,
        7200,
        `<rect width="1440" height="7200" fill="#f8fafc"/>
         ${Array.from(
             { length: 24 },
             (_, index) =>
                 `<rect x="120" y="${String(120 + index * 290)}" width="1200" height="240" rx="24" fill="${index % 5 === 0 ? "#2baccc" : "#e2e8f0"}"/>`,
         ).join("")}`,
    ),
);

export const generatedLandscape = item(
    "dusk-valley.png",
    1536,
    1024,
    art(1536, 1024, "#f3c9a5", "#fff3d6", ["#c27c6b", "#8a4f5c", "#4b2c48"]),
    2_100_000,
);
export const generatedSquare = item(
    "lake-morning.png",
    1024,
    1024,
    art(1024, 1024, "#bfe3f0", "#fffbe0", ["#6fb3b8", "#3a7f8c", "#1e4b5c"]),
    1_600_000,
);
export const generatedPortrait = item(
    "ridge-night.png",
    1024,
    1536,
    art(1024, 1536, "#28305e", "#f6e7a7", ["#4a4f8a", "#343a6e", "#1c1f42"]),
    1_900_000,
);

export const complaintCreateProfile = item(
    "create-profile.png",
    3456,
    2168,
    onboarding(3456, 2168, "Create your profile", "Create profile"),
    6_062_642,
);
export const complaintConnect = item(
    "connect-harnesses.png",
    3680,
    2392,
    onboarding(3680, 2392, "Connect your local harnesses", "Skip"),
    6_951_893,
);

const COLUMNS_TWO: ConversationMediaLayout = { type: "columns", columns: 2 };
const COLUMNS_ONE: ConversationMediaLayout = { type: "columns", columns: 1 };

function mediaTool(
    toolCallId: string,
    toolName: string,
    items: readonly ConversationMediaItem[],
    layout?: ConversationMediaLayout,
): ConversationToolCall {
    return {
        toolCallId,
        toolName,
        arguments: items.length === 1 ? { file_path: `/work/screens/${items[0]!.name}` } : {},
        status: "success",
        failed: false,
        presentation: { type: "media", items, ...(layout ? { layout } : {}) },
    };
}

export const readWideTool = mediaTool("tool-read-wide", "Read", [readWide], COLUMNS_TWO);
export const readFlatTool = mediaTool("tool-read-flat", "Read", [readFlat], COLUMNS_TWO);
export const readNarrowTool = mediaTool("tool-read-narrow", "Read", [readNarrow], COLUMNS_TWO);
export const readWideSecondTool = mediaTool(
    "tool-read-wide-2",
    "view_image",
    [readWideSecond],
    COLUMNS_TWO,
);
export const readTallTool = mediaTool("tool-read-tall", "Read", [readTall], COLUMNS_TWO);
export const imagegenTools: readonly ConversationToolCall[] = [
    mediaTool("tool-imagegen-1", "codex_imagegen", [generatedLandscape], COLUMNS_ONE),
    mediaTool("tool-imagegen-2", "codex_imagegen", [generatedSquare], COLUMNS_ONE),
    mediaTool("tool-imagegen-3", "codex_imagegen", [generatedPortrait], COLUMNS_ONE),
];

const text = (value: string): ConversationMediaLayoutNode => ({ type: "text", text: value });

/**
 * A layout as the daemon sends it, through the same check the connection
 * runs on it: what the screens show is what a real call would draw.
 */
function wireLayout(value: unknown, itemCount: number): ConversationMediaLayout {
    const layout = mediaLayoutProject(value, itemCount);
    if (!layout) throw new Error("fixture layout did not project");
    return layout;
}

/** A layout an agent wrote: a heading, a captioned two-up grid, and a full-width figure. */
export const treeLayout: ConversationMediaLayout = wireLayout(
    {
        type: "tree",
        root: [
            {
                type: "element",
                tag: "section",
                style: { display: "flex", flexDirection: "column", rowGap: "12px" },
                children: [
                    {
                        type: "element",
                        tag: "p",
                        style: { fontSize: "large", fontWeight: "700" },
                        children: [text("Onboarding, before and after")],
                    },
                    {
                        type: "element",
                        tag: "div",
                        style: {
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "12px",
                        },
                        children: [
                            {
                                type: "element",
                                tag: "figure",
                                style: { display: "flex", flexDirection: "column", rowGap: "6px" },
                                children: [
                                    { type: "item", index: 0, alt: "Before: create profile" },
                                    {
                                        type: "element",
                                        tag: "figcaption",
                                        style: { fontSize: "small", tone: "muted" },
                                        children: [
                                            {
                                                type: "element",
                                                tag: "strong",
                                                children: [text("Before.")],
                                            },
                                            text(
                                                " The form floats over the sky with no card behind it.",
                                            ),
                                        ],
                                    },
                                ],
                            },
                            {
                                type: "element",
                                tag: "figure",
                                style: { display: "flex", flexDirection: "column", rowGap: "6px" },
                                children: [
                                    { type: "item", index: 1, alt: "After: connect harnesses" },
                                    {
                                        type: "element",
                                        tag: "figcaption",
                                        style: { fontSize: "small", tone: "muted" },
                                        children: [
                                            {
                                                type: "element",
                                                tag: "strong",
                                                children: [text("After.")],
                                            },
                                            text(" One column, and "),
                                            {
                                                type: "element",
                                                tag: "code",
                                                children: [text("Skip")],
                                            },
                                            text(" is the primary action."),
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        type: "element",
                        tag: "figure",
                        style: { display: "flex", flexDirection: "column", rowGap: "6px" },
                        children: [
                            { type: "item", index: 2, style: { width: "100%" } },
                            {
                                type: "element",
                                tag: "figcaption",
                                style: { fontSize: "small", tone: "muted", textAlign: "center" },
                                children: [text("The header at full width, as shipped.")],
                            },
                        ],
                    },
                ],
            },
        ],
    },
    3,
);

export const treeTool = mediaTool(
    "tool-present-tree",
    "present_files",
    [complaintCreateProfile, complaintConnect, readFlat],
    treeLayout,
);
/** The automatic set from the complaint: two onboarding screenshots, no layout. */
export const automaticTool = mediaTool("tool-present-auto", "present_files", [
    complaintConnect,
    complaintCreateProfile,
]);
export const automaticMixedTool = mediaTool("tool-present-mixed", "present_files", [
    readWide,
    readNarrow,
    generatedSquare,
    readFlat,
    readWideSecond,
]);

function message(
    id: string,
    sender: ConversationAuthor,
    body: string,
    createdAt: string,
): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "media-layouts",
            sequence: id,
            changePts: id,
            sender,
            text: body,
            attachments: [],
            reactions: [],
            createdAt,
        },
    };
}

function activity(
    tool: ConversationToolCall,
    sequence: string,
    occurredAt: string,
): ConversationEntry {
    return {
        kind: "agentActivity",
        id: tool.toolCallId,
        sequence,
        occurredAt: Date.parse(occurredAt),
        activity: { kind: "tool", tool },
    };
}

/** Several sequential screenshot reads, then generated images: one grid per run. */
export const readRunEntries: readonly ConversationEntry[] = [
    message(
        "m-01",
        happyAgentOwnerAuthor,
        "Look at the screenshots in /work/screens and tell me what's off.",
        "2026-10-20T10:00:00.000Z",
    ),
    message("m-02", agentAuthor, "Reading the four screenshots.", "2026-10-20T10:00:05.000Z"),
    activity(readWideTool, "m-03", "2026-10-20T10:00:06.000Z"),
    activity(
        { ...happyAgentExplorationTool, toolCallId: "tool-explore-screens" },
        "m-04",
        "2026-10-20T10:00:07.000Z",
    ),
    activity(readFlatTool, "m-05", "2026-10-20T10:00:08.000Z"),
    activity(readNarrowTool, "m-06", "2026-10-20T10:00:09.000Z"),
    activity(readWideSecondTool, "m-07", "2026-10-20T10:00:10.000Z"),
    message(
        "m-08",
        agentAuthor,
        "The header strip and the sidebar crop are both shown whole now. Generating three alternatives for the hero image.",
        "2026-10-20T10:00:20.000Z",
    ),
    ...imagegenTools.map((tool, index) =>
        activity(tool, `m-1${String(index)}`, `2026-10-20T10:01:0${String(index)}.000Z`),
    ),
];

/** What `present_files` shows: an agent-written tree, then unarranged sets. */
export const presentedEntries: readonly ConversationEntry[] = [
    message(
        "m-19",
        happyAgentOwnerAuthor,
        "Put the before and after side by side for me.",
        "2026-10-20T10:01:50.000Z",
    ),
    message(
        "m-20",
        agentAuthor,
        "Here is the comparison, laid out with captions.",
        "2026-10-20T10:02:00.000Z",
    ),
    activity(treeTool, "m-21", "2026-10-20T10:02:01.000Z"),
    message("m-22", agentAuthor, "And the two raw screens:", "2026-10-20T10:02:10.000Z"),
    activity(automaticTool, "m-23", "2026-10-20T10:02:11.000Z"),
    activity(automaticMixedTool, "m-24", "2026-10-20T10:02:12.000Z"),
    message("m-25", agentAuthor, "Nothing above is cropped.", "2026-10-20T10:02:20.000Z"),
];

/*
 * The lenient CSS a `present_files` layout may use, one call per idea. Every
 * layout here is written as the daemon sends it and goes through the
 * connection's own check, so the invalid one shows exactly what survives.
 */

/** A settings dialog captured on a Retina display: 1040 × 720 pixels at 2×, 520 × 360 points. */
export const retinaDialog = item(
    "settings-dialog@2x.png",
    1040,
    720,
    svg(
        1040,
        720,
        `<rect width="1040" height="720" rx="28" fill="#ffffff"/>
         <rect width="1040" height="96" rx="28" fill="#f1f5f9"/><rect y="60" width="1040" height="36" fill="#f1f5f9"/>
         <circle cx="44" cy="48" r="12" fill="#ff5f57"/><circle cx="80" cy="48" r="12" fill="#febc2e"/><circle cx="116" cy="48" r="12" fill="#28c840"/>
         <text x="520" y="58" text-anchor="middle" ${TEXT} font-size="28" font-weight="700" fill="#0f172a">Settings</text>
         ${["Appearance", "Notifications", "Agents", "Shortcuts"]
             .map(
                 (label, index) =>
                     `<text x="64" y="${String(176 + index * 120)}" ${TEXT} font-size="28" fill="#0f172a">${label}</text>
                      <rect x="840" y="${String(146 + index * 120)}" width="120" height="44" rx="22" fill="${index % 2 === 0 ? "#2baccc" : "#cbd5e1"}"/>
                      <circle cx="${String(index % 2 === 0 ? 938 : 862)}" cy="${String(168 + index * 120)}" r="18" fill="#ffffff"/>
                      <rect x="64" y="${String(204 + index * 120)}" width="912" height="2" fill="#e2e8f0"/>`,
             )
             .join("")}`,
    ),
    420_000,
    2,
);
/** An app icon: 128 pixels at 2×, so 64 points. */
export const appIcon = item(
    "app-icon@2x.png",
    128,
    128,
    svg(
        128,
        128,
        `<defs><linearGradient id="icon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2baccc"/><stop offset="1" stop-color="#5b5bd6"/></linearGradient></defs>
         <rect width="128" height="128" rx="28" fill="url(#icon)"/>
         <circle cx="64" cy="64" r="30" fill="#ffffff"/><circle cx="64" cy="64" r="14" fill="#5b5bd6"/>`,
    ),
    9_000,
    2,
);
/** A small chart at 1×: 480 × 270 pixels. */
export const smallChart = item(
    "weekly-chart.png",
    480,
    270,
    svg(
        480,
        270,
        `<rect width="480" height="270" fill="#0f172a"/>
         ${Array.from(
             { length: 7 },
             (_, index) =>
                 `<rect x="${String(40 + index * 60)}" y="${String(220 - ((index * 53) % 150) - 30)}" width="36" height="${String(((index * 53) % 150) + 30)}" rx="6" fill="${index === 4 ? "#34c38f" : "#475569"}"/>`,
         ).join("")}
         <text x="24" y="36" ${TEXT} font-size="18" font-weight="700" fill="#e2e8f0">Weekly runs</text>`,
    ),
    40_000,
);
/** A "New" badge: 240 × 120 pixels at 2×, 120 × 60 points — smaller than the box it is shown in. */
export const newBadge = item(
    "new-badge@2x.png",
    240,
    120,
    svg(
        240,
        120,
        `<rect width="240" height="120" rx="60" fill="#f59e0b"/>
         <text x="120" y="78" text-anchor="middle" ${TEXT} font-size="52" font-weight="700" fill="#ffffff">NEW</text>`,
    ),
    6_000,
    2,
);
const palettes = [
    ["#fde2c8", "#fff7e6", ["#e9a178", "#b5655a", "#6e3b4f"]],
    ["#d6ecf3", "#fffbe0", ["#7fbfc4", "#3f8a96", "#1f5464"]],
    ["#e8e1f7", "#fff3d6", ["#a99bd8", "#6f5fae", "#3c3474"]],
    ["#dff3e4", "#fffbe0", ["#8fcf9e", "#4c9a68", "#255c3d"]],
    ["#f7e0e6", "#fff0d6", ["#e29bb0", "#b05c7a", "#5e2f4a"]],
    ["#e2e8f0", "#fffbe0", ["#94a3b8", "#64748b", "#334155"]],
] as const;
export const thumbnails = palettes.map(([sky, sun, hills], index) =>
    item(`variant-${String(index + 1)}.png`, 800, 600, art(800, 600, sky, sun, hills), 210_000),
);

const caption = (...children: unknown[]) => ({
    type: "element",
    tag: "figcaption",
    style: { fontSize: "small", tone: "muted" },
    children,
});
const heading = (value: string) => ({
    type: "element",
    tag: "p",
    style: { fontSize: "large", fontWeight: "600" },
    children: [text(value)],
});
const code = (value: string) => ({ type: "element", tag: "code", children: [text(value)] });
const figure = (style: Record<string, string>, ...children: unknown[]) => ({
    type: "element",
    tag: "figure",
    style: { display: "flex", flexDirection: "column", rowGap: "6px", ...style },
    children,
});

/** Natural size in points, an icon that stays small, and percentage widths. */
export const sizesTool = mediaTool(
    "tool-present-sizes",
    "present_files",
    [retinaDialog, appIcon, generatedLandscape, smallChart],
    wireLayout(
        {
            type: "tree",
            root: [
                {
                    type: "element",
                    tag: "section",
                    style: { display: "flex", flexDirection: "column", rowGap: "16px" },
                    children: [
                        heading("Natural size and widths"),
                        figure(
                            {},
                            { type: "item", index: 0, alt: "Settings dialog" },
                            caption(
                                text(
                                    "Retina capture, 1040 × 720 px at 2×, with no width: drawn at its ",
                                ),
                                code("520 × 360"),
                                text(" points."),
                            ),
                        ),
                        figure(
                            { flexDirection: "row", alignItems: "center", columnGap: "12px" },
                            { type: "item", index: 1, alt: "App icon" },
                            caption(text("An app icon, 128 px at 2×, stays 64 points.")),
                        ),
                        figure(
                            {},
                            { type: "item", index: 2, style: { width: "50%" } },
                            caption(code("width: 50%")),
                        ),
                        figure(
                            {},
                            { type: "item", index: 3, style: { width: "100%" } },
                            caption(code("width: 100%"), text(" fills, even past its 480 px.")),
                        ),
                    ],
                },
            ],
        },
        4,
    ),
);

/** `object-fit` on a fixed square, then a flex row of captioned figures. */
export const fitTool = mediaTool(
    "tool-present-fit",
    "present_files",
    [generatedPortrait, generatedLandscape, newBadge, complaintCreateProfile, complaintConnect],
    wireLayout(
        {
            type: "tree",
            root: [
                heading("object-fit on aspect-ratio: 1"),
                {
                    type: "element",
                    tag: "div",
                    style: { display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "8px" },
                    children: (
                        [
                            [0, "cover"],
                            [1, "contain"],
                            [2, "scale-down"],
                        ] as const
                    ).map(([index, fit]) =>
                        figure(
                            { width: "200px" },
                            {
                                type: "item",
                                index,
                                style: {
                                    width: "200px",
                                    aspectRatio: "1",
                                    objectFit: fit,
                                    borderRadius: "12px",
                                },
                            },
                            caption(code(`object-fit: ${fit}`)),
                        ),
                    ),
                },
                {
                    type: "element",
                    tag: "p",
                    style: { fontSize: "large", fontWeight: "600", marginTop: "20px" },
                    children: [text("A flex row with captions")],
                },
                {
                    type: "element",
                    tag: "div",
                    style: { display: "flex", columnGap: "12px", marginTop: "8px" },
                    children: [
                        figure(
                            { flex: "1", minWidth: "0" },
                            { type: "item", index: 3, style: { width: "100%" } },
                            caption(
                                { type: "element", tag: "strong", children: [text("Before.")] },
                                text(" The form floats over the sky."),
                            ),
                        ),
                        figure(
                            { flex: "1", minWidth: "0" },
                            { type: "item", index: 4, style: { width: "100%" } },
                            caption(
                                { type: "element", tag: "strong", children: [text("After.")] },
                                text(" One column, and Skip leads."),
                            ),
                        ),
                    ],
                },
            ],
        },
        5,
    ),
);

/** A responsive grid: as many 200 px-or-wider columns as fit. */
export const gridTool = mediaTool(
    "tool-present-grid",
    "present_files",
    thumbnails,
    wireLayout(
        {
            type: "tree",
            root: [
                {
                    type: "element",
                    tag: "p",
                    style: { fontWeight: "600" },
                    children: [code("repeat(auto-fill, minmax(200px, 1fr))")],
                },
                {
                    type: "element",
                    tag: "div",
                    style: {
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                        gap: "8px",
                        marginTop: "8px",
                    },
                    children: thumbnails.map((_, index) => ({
                        type: "item",
                        index,
                        style: {
                            width: "100%",
                            aspectRatio: "4 / 3",
                            objectFit: "cover",
                            borderRadius: "8px",
                        },
                    })),
                },
            ],
        },
        thumbnails.length,
    ),
);

/**
 * A layout with mistakes in it: an unknown tag, properties outside the
 * subset, values outside the grammar, an index past the items, and an item
 * named twice. Each bad part is dropped on its own; the rest still draws, and
 * the item the layout never named is appended at the end.
 */
export const invalidTool = mediaTool(
    "tool-present-invalid",
    "present_files",
    [readWide, generatedSquare],
    wireLayout(
        {
            type: "tree",
            root: [
                {
                    type: "element",
                    tag: "marquee",
                    style: {
                        display: "flex",
                        flexDirection: "sideways",
                        flexWrap: "wrap",
                        gap: "calc(10px + 2px)",
                        rowGap: "10px",
                        color: "red",
                        background: "url(https://example.com/x.png)",
                    },
                    children: [
                        {
                            type: "element",
                            tag: "p",
                            style: { tone: "danger", fontSize: "huge", textAlign: "center" },
                            children: [
                                text("Dropped: the "),
                                code("marquee"),
                                text(" tag (drawn as a div), "),
                                code("color"),
                                text(", "),
                                code("background"),
                                text(", "),
                                code("gap: calc(…)"),
                                text(", "),
                                code("width: red"),
                                text(", "),
                                code("object-fit: zoom"),
                                text(", item 9, and the second item 0."),
                            ],
                        },
                        {
                            type: "item",
                            index: 0,
                            style: {
                                width: "red",
                                objectFit: "zoom",
                                borderRadius: "-4px",
                                maxWidth: "70%",
                            },
                        },
                        { type: "item", index: 9 },
                        { type: "item", index: 0, style: { width: "100%" } },
                    ],
                },
            ],
        },
        2,
    ),
);

/** The lenient layouts, one present_files call each. */
export const lenientEntries: readonly ConversationEntry[] = [
    message(
        "m-30",
        happyAgentOwnerAuthor,
        "Show me how the layout CSS behaves.",
        "2026-10-20T10:03:00.000Z",
    ),
    message("m-31", agentAuthor, "Sizes first.", "2026-10-20T10:03:05.000Z"),
    activity(sizesTool, "m-32", "2026-10-20T10:03:06.000Z"),
    message("m-33", agentAuthor, "Fitting, and a captioned row.", "2026-10-20T10:03:10.000Z"),
    activity(fitTool, "m-34", "2026-10-20T10:03:11.000Z"),
    message("m-35", agentAuthor, "A responsive grid.", "2026-10-20T10:03:15.000Z"),
    activity(gridTool, "m-36", "2026-10-20T10:03:16.000Z"),
    message(
        "m-37",
        agentAuthor,
        "And a layout with mistakes: the bad parts fall away and the rest still draws.",
        "2026-10-20T10:03:20.000Z",
    ),
    activity(invalidTool, "m-38", "2026-10-20T10:03:21.000Z"),
];

/*
 * Layouts written into the reply itself. Each picture was shown earlier by a
 * read; the reply names it by the path the read used, and the read no longer
 * draws a picture the reply placed.
 */

function sourced(media: ConversationMediaItem, path: string): ConversationMediaItem {
    return { ...media, source: { path, absolutePath: `/work/${path}` } };
}

const inlineReads = [
    sourced(readWide, "screens/onboarding-desktop.png"),
    sourced(readWideSecond, "screens/settings-models.png"),
    sourced(thumbnails[0]!, "screens/thumb-0.png"),
    sourced(readFlat, "screens/header-strip.png"),
    sourced(readNarrow, "screens/sidebar-crop.png"),
    sourced(retinaDialog, "screens/settings-dialog@2x.png"),
].map((media, index) =>
    mediaTool(`tool-inline-read-${String(index)}`, "Read", [media], COLUMNS_TWO),
);

const INLINE_REPLY = `Here is what I found, side by side.

<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px">
  <figure><img src="screens/onboarding-desktop.png" style="width: 100%"><figcaption>Overview</figcaption></figure>
  <figure><img src="/work/screens/settings-models.png" style="width: 100%"><figcaption>Models</figcaption></figure>
  <figure><img src="screens/thumb-0.png" style="width: 100%"><figcaption>Hero, first try</figcaption></figure>
</div>

The header strip runs the full width, and the sidebar sits beside the Retina dialog at its point size:

<img src="screens/header-strip.png" style="width: 100%">

<div style="display: flex; gap: 16px; align-items: flex-start">
  <img src="screens/sidebar-crop.png" style="width: 120px">
  <img src="screens/settings-dialog@2x.png">
</div>

<div style="color: red"><b>HTML with no picture stays text.</b></div>

<div><img src="screens/not-shown.png"></div>`;

/** A reply that lays out the pictures it read, among its own text. */
export const inlineEntries: readonly ConversationEntry[] = [
    message(
        "m-40",
        happyAgentOwnerAuthor,
        "Compare the screens you just read.",
        "2026-10-20T10:04:00.000Z",
    ),
    ...inlineReads.map((tool, index) =>
        activity(tool, `m-4${String(index + 1)}`, `2026-10-20T10:04:0${String(index + 1)}.000Z`),
    ),
    message("m-48", agentAuthor, INLINE_REPLY, "2026-10-20T10:04:20.000Z"),
];

/*
 * Rich-reply widgets written straight into the reply's HTML: a chart, a
 * Mermaid diagram, a code quote, and a changed-files list, resolving a block
 * with no picture at all, plus one beside a picture, and one invalid widget
 * whose block stays the inert text it was written as.
 */

const WIDGET_REPLY = `Profiling done. Parse dominated before; after the change the three phases are even.

<happy-chart type="hbar"><script type="application/json">
{ "labels": ["Parse", "Layout", "Paint"],
  "series": [{ "name": "Before", "values": [412, 96, 31] },
             { "name": "After", "values": [118, 94, 30] }],
  "unit": "ms" }
</script></happy-chart>

Month over month, p50 holds flat while p99 falls:

<happy-chart type="line"><script type="application/json">
{ "labels": ["May", "Jun", "Jul", "Aug", "Sep", "Oct"],
  "series": [{ "name": "p50", "values": [41, 39, 40, 38, null, 37] },
             { "name": "p99", "values": [310, 290, 240, 205, 170, 140] }],
  "unit": "ms" }
</script></happy-chart>

The retry path now flows through one scheduler:

<happy-diagram><script type="text/x-mermaid">
flowchart LR
    call[Tool call] --> queue[Retry queue]
    queue --> scheduler{Scheduler}
    scheduler -->|idempotency key| provider[Provider]
    provider -->|429| queue
</script></happy-diagram>

The whole fix is two lines of backoff:

<happy-code language="ts" path="src/retry.ts"><script type="text/plain">
    const delay = Math.min(cap, base * 2 ** attempt);
    await sleep(delay + jitter());
</script></happy-code>

<happy-files><script type="application/json">
[ { "path": "src/retry.ts", "status": "modified", "added": 14, "removed": 3 },
  { "path": "src/retry.test.ts", "status": "added", "added": 52 },
  { "path": "src/legacy/backoff.ts", "status": "deleted", "removed": 88 } ]
</script></happy-files>

A chart sits beside the screenshot that motivated it:

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start">
  <figure><img src="screens/weekly-chart.png" style="width: 100%"><figcaption style="tone: muted; font-size: small">The dashboard's own chart</figcaption></figure>
  <figure><happy-chart><script type="application/json">{ "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"], "series": [{ "values": [12, 19, 7, 23, 16] }], "unit": "runs" }</script></happy-chart><figcaption style="tone: muted; font-size: small">The same week, as a chart</figcaption></figure>
</div>

An invalid widget hides nothing — this block stays text:

<happy-chart>not json at all</happy-chart>`;

const widgetChartRead = mediaTool(
    "tool-widget-read-chart",
    "Read",
    [sourced(smallChart, "screens/weekly-chart.png")],
    COLUMNS_TWO,
);

/** A reply that carries charts, a diagram, a code quote, and a files list, with zero tool calls. */
export const widgetEntries: readonly ConversationEntry[] = [
    message(
        "m-70",
        happyAgentOwnerAuthor,
        "Profile the renderer and show me what changed.",
        "2026-10-20T10:08:00.000Z",
    ),
    activity(widgetChartRead, "m-71", "2026-10-20T10:08:01.000Z"),
    message("m-72", agentAuthor, WIDGET_REPLY, "2026-10-20T10:08:20.000Z"),
];

/*
 * Recordings an agent made on a phone and presented, then laid out again —
 * with no stated size, as today's daemon presents every recording, so the
 * transcript learns each shape from the recording itself.
 */
const unsized = ({ width: _width, height: _height, ...item }: ConversationMediaItem) => ({
    ...item,
    url: `${item.url}#transcript`,
});
const phoneTakes = [mediaPhoneInbox, mediaPhoneProfile, mediaPhoneSettings].map(unsized);
const phoneRetakes = phoneTakes.map((take) =>
    sourced(
        { ...take, name: take.name.replace(".webm", "-dark.webm") },
        `recordings/${take.name.replace(".webm", "-dark.webm")}`,
    ),
);

const VIDEO_REPLY = `Same three screens in dark mode, side by side:

<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px">
  <figure><img src="recordings/inbox-dark.webm" style="width: 100%"><figcaption>Inbox</figcaption></figure>
  <figure><img src="recordings/profile-dark.webm" style="width: 100%"><figcaption>Profile</figcaption></figure>
  <figure><img src="recordings/settings-dark.webm" style="width: 100%"><figcaption>Settings</figcaption></figure>
</div>

The profile screen still jumps when the keyboard opens.`;

/** Phone recordings presented together, a desktop one, and a reply's grid of retakes. */
export const videoEntries: readonly ConversationEntry[] = [
    message(
        "m-60",
        happyAgentOwnerAuthor,
        "Record the onboarding screens on the iPhone and show me.",
        "2026-10-20T10:06:00.000Z",
    ),
    message(
        "m-61",
        agentAuthor,
        "Recorded the three onboarding screens on the iPhone 12.",
        "2026-10-20T10:06:30.000Z",
    ),
    activity(
        mediaTool("tool-present-phones", "present_files", phoneTakes),
        "m-62",
        "2026-10-20T10:06:31.000Z",
    ),
    message("m-63", agentAuthor, "And the desktop walkthrough:", "2026-10-20T10:06:40.000Z"),
    activity(
        mediaTool("tool-present-desktop", "present_files", [unsized(mediaDesktopRecording)]),
        "m-64",
        "2026-10-20T10:06:41.000Z",
    ),
    activity(
        mediaTool("tool-present-retakes", "present_files", phoneRetakes),
        "m-65",
        "2026-10-20T10:07:00.000Z",
    ),
    message("m-66", agentAuthor, VIDEO_REPLY, "2026-10-20T10:07:10.000Z"),
    message("m-67", agentAuthor, "And the odd sizes:", "2026-10-20T10:07:20.000Z"),
    activity(
        mediaTool("tool-present-aspects", "present_files", mediaAspectRecordings.map(unsized)),
        "m-68",
        "2026-10-20T10:07:21.000Z",
    ),
];
