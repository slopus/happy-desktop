import { RichTaskList } from "../../src/RichTaskList";
import { StoriesRow, type StoriesRowItem } from "../../src/StoriesRow";
import { StoryViewer, type StoryViewerProps } from "../../src/StoryViewer";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-334";

/* The "Sidebar sub-rows" proposal's stories, with its photos and its story frame. */
const asset = (name: string) => new URL(`../assets/rich-tasks/${name}`, import.meta.url).href;
const noop = () => undefined;
const person = (label: string, image?: string) =>
    ({ kind: "person", label, ...(image ? { imageUrl: asset(image) } : {}) }) as const;
const UX = { kind: "icon", slug: "ux", label: "Onboarding redesign" } as const;
const ring = (mark: StoriesRowItem["mark"], total: number, unseen: number, self = false) => ({
    id: mark.label,
    name: mark.label,
    mark,
    segments: { total, unseen },
    self,
});
const ITEMS: readonly StoriesRowItem[] = [
    ring(person("My story", "kirill.png"), 0, 0, true),
    ring(person("Steve", "steve.jpg"), 1, 1),
    ring(person("Jordan"), 2, 1),
    ring(person("System Health", "bot-health.webp"), 3, 3),
    ring({ ...UX, label: "Onboarding" }, 4, 2),
];
const CARD = { faces: [], signal: "unread" as const, subRows: [], more: 0, expanded: false };
const card = (title: string, iconSlug: string, status: string, unseen: number) => ({
    kind: "task" as const,
    card: { ...CARD, id: title, title, time: "4m", status, iconSlug, story: { total: 2, unseen } },
});
const reply = (name: string, image: string | undefined, text: string) => ({
    id: name,
    name,
    mark: person(name, image),
    time: "4m",
    text,
});

const VIEWER: StoryViewerProps = {
    segment: { index: 0, total: 2 },
    poster: { name: "Onboarding redesign", mark: UX },
    time: "2h",
    frame: { kind: "image", url: asset("story-frame.jpg") },
    caption:
        "Onboarding for the Projects sidebar: Happy adds your projects and drafts a first task",
    replies: {
        status: "ready",
        items: [
            reply("Steve", "steve.jpg", "looks good, ship it? “Use selected” is too far away"),
            reply("Jordan", undefined, "🔥 can we get this into the release notes video?"),
        ],
    },
    replyTarget: "Onboarding redesign",
    reply: { phase: "idle" },
    action: { phase: "idle" },
    onReplySend: noop,
    onRepost: noop,
    onStep: noop,
    onClose: noop,
};

export function StoriesPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Stories in rich mode: the header over the sidebar's list (My story first, one ring segment per live story, greyed once seen), the ring on a card's disc, and the viewer with its solid reply bar and round video repost."
            title="Stories"
        >
            <Specimen
                detail="304px · 48px rings · 50px card disc"
                label="Header"
                number="01"
                stage="chrome"
            >
                <div
                    style={{ display: "flex", flexDirection: "column", width: 304, paddingTop: 12 }}
                >
                    <StoriesRow items={ITEMS} onOpen={noop} />
                    <RichTaskList
                        onMoreToggle={noop}
                        onSectionCollapseToggle={noop}
                        onSelect={noop}
                        onStoryOpen={noop}
                        rows={[
                            card("Onboarding redesign", "ux", "Steve and Jordan replied", 1),
                            card("SHIP BOSS", "deploy", "Needs your yes on 1ff04853", 0),
                        ]}
                        selectedId={null}
                    />
                </div>
            </Specimen>
            <Specimen
                detail="Reposter's view · owner's view of a 3-story ring, reply sent"
                label="Viewer"
                number="02"
            >
                <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
                    <StoryViewer {...VIEWER} />
                    <StoryViewer
                        {...VIEWER}
                        onRepost={undefined}
                        onTakeDown={noop}
                        reply={{ phase: "sent" }}
                        segment={{ index: 1, total: 3 }}
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
