import { avatarToneOf } from "../../src/Avatar";
import { ConversationView } from "../../src/ConversationView";
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
    ({
        kind: "person",
        label,
        tone: avatarToneOf(label),
        ...(image ? { imageUrl: asset(image) } : {}),
    }) as const;
const UX = { kind: "icon", src: asset("icon-ux.png"), label: "Onboarding redesign" } as const;
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
const card = (title: string, icon: string, status: string, unseen: number) => ({
    kind: "task" as const,
    card: {
        ...CARD,
        id: title,
        title,
        time: "4m",
        status,
        iconSrc: asset(`icon-${icon}.png`),
        story: { total: 2, unseen },
    },
});
const reply = (name: string, time: string, text: string, image?: string) => ({
    id: name,
    name,
    mark: person(name, image),
    time,
    text,
});
const REPLIES = [
    reply("Maya", "1h", "Can the empty state show one example project?"),
    reply("Alex", "48m", "Love that it drafts the first task 👏"),
    reply("Priya", "30m", "Step 2 copy is a bit long, can we cut it in half?"),
    reply(
        "Steve",
        "12m",
        "looks good, ship it? one nit: “Use selected” is too far from the table",
        "steve.jpg",
    ),
    reply("Jordan", "4m", "🔥 can we get this into the release notes video?"),
];

const VIEWER: StoryViewerProps = {
    segment: { index: 0, total: 2 },
    poster: { name: "Onboarding redesign", mark: UX },
    time: "2h",
    frame: { kind: "image", url: asset("story-page.jpg") },
    caption:
        "Onboarding for the Projects sidebar: Happy adds your projects and drafts one first task",
    replies: { status: "ready", items: REPLIES.slice(3) },
    replyTarget: "Onboarding redesign",
    reply: { phase: "idle" },
    action: { phase: "idle" },
    onReplySend: noop,
    onRepost: noop,
    onStep: noop,
    onClose: noop,
};

/* A chat parked on older rows: Steve's and Jordan's replies and the agent's answer are unread. */
const said = (id: string, name: string, kind: "human" | "agent", text: string, at: number) => ({
    kind: "message" as const,
    source: "server" as const,
    delivery: "sent" as const,
    message: {
        // oxlint-disable-next-line unicorn/no-useless-spread -- one line for the fixed fields
        ...{ id, sequence: id, changePts: id, chatId: "c", text, attachments: [], reactions: [] },
        sender: { id: name, displayName: name, username: name, kind },
        createdAt: new Date(at).toISOString(),
        ...(name === "Steve" ? { replyTo: { kind: "story", artifactId: "s1" } as const } : {}),
    },
});
const CHAT = [
    ...[1, 2, 3].map((n) => said(`m${n}`, "Agent", "agent", "Checked the empty state.", n)),
    said("steve", "Steve", "human", "looks good, ship it? one nit: “Use selected”", 10),
    said("jordan", "Jordan", "human", "🔥 can we get this into the notes video?", 11),
    said("agent", "Agent", "agent", "Moved “Use selected” under the table.", 12),
];
const FACES = [person("Steve", "steve.jpg"), person("Jordan")];
const RICH = {
    storyQuote: () => ({ kind: "live", ...VIEWER }) as const,
    onStoryQuoteOpen: noop,
    unread: { since: 10, from: FACES.map((mark) => ({ userId: mark.label, mark })) },
};

export function StoriesPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Stories in rich mode: the header over the sidebar's list (My story first, one ring segment per live story, greyed once seen), the ring on a card's disc, and the viewer with its replies over the frame, their drawer, and round video repost."
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
                detail="620×700 · reposter's view, 2 replies · owner's view, 5 replies (open the peek for the drawer)"
                label="Viewer"
                number="02"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
                    <StoryViewer {...VIEWER} />
                    <StoryViewer
                        {...VIEWER}
                        onRepost={undefined}
                        onTakeDown={noop}
                        caption="Wall from today’s design review: every screen of the new onboarding, pinned up"
                        frame={{ kind: "image", url: asset("story-wall.jpg") }}
                        replies={{ status: "ready", items: REPLIES }}
                    />
                </div>
            </Specimen>
            <Specimen detail="420×520 · quote, jump buttons" label="Chat" number="03">
                <ConversationView
                    entries={CHAT}
                    rich={RICH}
                    scrollPosition={{ scrollTop: 0, following: false }}
                    style={{ width: 420, height: 520 }}
                    viewerId="Kirill"
                />
            </Specimen>
        </ComponentPage>
    );
}
