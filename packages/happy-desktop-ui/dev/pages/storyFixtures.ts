import type { ToneName } from "../../src/Avatar";
import type { StoriesRowItem } from "../../src/StoriesRow";
import type { StoryViewerProps } from "../../src/StoryViewer";

/* A drawn app screenshot, as an agent posts one, on a white page and on a dark one. */
const screenshot = (page: string, ink: string) =>
    `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480"><rect width="720" height="480" fill="${page}"/><rect width="180" height="480" fill="${ink}" opacity=".06"/>${[
            60, 96, 132, 168, 204,
        ]
            .map(
                (y) =>
                    `<rect x="20" y="${y}" width="120" height="10" rx="5" fill="${ink}" opacity=".18"/>`,
            )
            .join(
                "",
            )}<rect x="220" y="60" width="380" height="14" rx="7" fill="${ink}" opacity=".5"/><rect x="220" y="92" width="460" height="10" rx="5" fill="${ink}" opacity=".2"/><rect x="220" y="114" width="420" height="10" rx="5" fill="${ink}" opacity=".2"/><rect x="220" y="160" width="300" height="120" rx="12" fill="#2baccc" opacity=".25"/><rect x="220" y="400" width="460" height="44" rx="22" fill="${ink}" opacity=".08"/></svg>`,
    )}`;

export const STORY_FRAME_LIGHT = screenshot("#ffffff", "#000000");
export const STORY_FRAME_DARK = screenshot("#111111", "#ffffff");

/** The proposal's header: my story, Steve and Jordan's reposts, a bot and a task. */
const person = (name: string, tone: ToneName, total: number, unseen: number): StoriesRowItem => ({
    id: name.toLowerCase(),
    name,
    mark: { kind: "person", label: name, tone },
    segments: { total, unseen },
});
const icon = (name: string, slug: string, total: number, unseen: number): StoriesRowItem => ({
    id: slug,
    name,
    mark: { kind: "icon", slug, label: name },
    segments: { total, unseen },
});

export const STORIES_ROW_ITEMS: readonly StoriesRowItem[] = [
    { ...person("Kirill", "ocean", 0, 0), self: true },
    person("Steve", "ember", 1, 1),
    person("Jordan", "mint", 2, 1),
    icon("System Health", "monitoring", 3, 3),
    icon("Onboarding", "ux", 1, 1),
    person("Maya", "violet", 1, 0),
];

/** The proposal's story: the onboarding task's frame, with Steve's and Jordan's replies. */
export const STORY_VIEWER_PROPS: StoryViewerProps = {
    segments: { total: 2, current: 0 },
    poster: {
        name: "Onboarding redesign",
        mark: { kind: "icon", slug: "ux", label: "Onboarding" },
    },
    time: "2h",
    frame: { kind: "image", url: STORY_FRAME_LIGHT },
    caption:
        "Onboarding for the Projects sidebar: Happy adds your projects and drafts one first task",
    replies: {
        status: "ready",
        items: [
            {
                id: "r1",
                name: "Steve",
                mark: { kind: "person", label: "Steve", tone: "ember" },
                text: "looks good, ship it? one nit: “Use selected” is too far from the table",
                time: "12m",
            },
            {
                id: "r2",
                name: "Jordan",
                mark: { kind: "person", label: "Jordan", tone: "mint" },
                text: "🔥 can we get this into the release notes video?",
                time: "4m",
            },
        ],
    },
    replyTarget: "Onboarding redesign",
    reply: { phase: "idle" },
    action: { phase: "idle" },
    onReplySend: () => undefined,
    onRepost: () => undefined,
    onStep: () => undefined,
    onClose: () => undefined,
};
