import { useState } from "react";
import { Sidebar, type SidebarItem } from "../../src/Sidebar";
import { StoriesRow } from "../../src/StoriesRow";
import { StoryViewer, type StoryViewerReply } from "../../src/StoryViewer";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-332";

/** A drawn 9:16 frame, so the page loads nothing from the network. */
const FRAME = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1600">
        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#1d3b6e"/><stop offset="1" stop-color="#e08a4f"/>
        </linearGradient></defs>
        <rect width="900" height="1600" fill="url(#g)"/>
        <circle cx="450" cy="980" r="220" fill="#ffd27a"/>
        <rect y="1120" width="900" height="480" fill="#24324a"/>
    </svg>`,
)}`;

const rows = (story: "off" | "on"): SidebarItem[] => [
    {
        id: "onboarding",
        initials: "KD",
        kind: "project",
        label: "Desktop onboarding",
        ...(story === "on" ? { story: "unseen" as const } : {}),
    },
    {
        id: "release",
        initials: "RB",
        kind: "project",
        label: "Release bot",
        ...(story === "on" ? { story: "seen" as const } : {}),
    },
    { id: "docs", initials: "SK", kind: "project", label: "API docs" },
];

function StorySidebar(props: { readonly story: "off" | "on" }) {
    return (
        <Sidebar
            activeItemId=""
            onItemSelect={() => undefined}
            onItemStoryOpen={() => undefined}
            sections={[{ id: "tasks", items: rows(props.story), label: "Tasks" }]}
            style={{ height: 160, width: 260 }}
        />
    );
}

const REPLIES: StoryViewerReply[] = [
    { id: "1", name: "Mia", face: { initials: "M", tone: "rose" }, text: "Love it" },
    {
        id: "2",
        name: "Sam",
        face: { initials: "S", tone: "mint" },
        text: "Can setup skip the camera step?",
    },
    { id: "3", name: "Ana", face: { initials: "A", tone: "amber" }, text: "Ship it" },
];

function ViewerSpecimen(props: { readonly screen: string; readonly repost?: boolean }) {
    const [index, setIndex] = useState(1);
    const [replies, setReplies] = useState(REPLIES.slice(-2));
    return (
        <div
            data-screen={props.screen}
            style={{ contain: "layout", height: 640, position: "relative", width: 900 }}
        >
            <StoryViewer
                caption="Onboarding now opens on the welcome screen, with setup one click away."
                media={{ kind: "image", url: FRAME }}
                onClose={() => setIndex(1)}
                onDelete={() => undefined}
                onRepliesOpen={() => setReplies(REPLIES)}
                onReplySend={() => undefined}
                onRepost={async () => true}
                onStep={(delta) => setIndex((at) => Math.min(2, Math.max(0, at + delta)))}
                poster={
                    props.repost
                        ? { name: "Kirill", face: { initials: "K", tone: "ocean" } }
                        : { name: "Desktop onboarding", face: { initials: "KD", type: "agent" } }
                }
                replies={replies}
                replyCount={REPLIES.length}
                {...(props.repost
                    ? { repost: { from: "Desktop onboarding", roundUrl: null } }
                    : {})}
                segment={{ index, total: 3 }}
                time="5m"
            />
        </div>
    );
}

export function StoryPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A task's or bot's live story: an outline around its existing row tile, and the full-window viewer it opens."
            title="Stories"
        >
            <Specimen
                detail="No story: rows exactly as without stories"
                label="Rows — stories off"
                number="01"
                stage="chrome"
            >
                <div data-screen="01-rows-off">
                    <StorySidebar story="off" />
                </div>
            </Specimen>
            <Specimen
                detail="The tile’s own outline, 1.5 px outside it · accent unseen · grey seen"
                label="Rows — unseen and seen"
                number="02"
                stage="chrome"
            >
                <div data-screen="02-rows-unseen-seen">
                    <StorySidebar story="on" />
                </div>
            </Specimen>
            <Specimen
                detail="Always dark · 9:16 frame · segments, poster, caption · halves step · close"
                label="Viewer"
                number="03"
                stage="app"
            >
                <ViewerSpecimen screen="03-viewer" />
            </Specimen>
            <Specimen
                detail="Agents as rounded tiles, people as circles · unseen first · the rows’ ring"
                label="Stories row"
                number="04"
                stage="chrome"
            >
                <div data-screen="04-row" style={{ width: 260 }}>
                    <StoriesRow
                        items={[
                            {
                                id: "a",
                                name: "Desktop onboarding",
                                face: { initials: "KD", type: "agent" },
                                state: "unseen",
                            },
                            {
                                id: "p",
                                name: "Kirill",
                                face: { initials: "K", tone: "ocean" },
                                state: "unseen",
                            },
                            {
                                id: "b",
                                name: "Release bot",
                                face: { initials: "RB", type: "agent" },
                                state: "seen",
                            },
                        ]}
                        onOpen={() => undefined}
                    />
                </div>
            </Specimen>
            <Specimen
                detail="Reposted from chip · the person’s circle"
                label="Viewer — repost"
                number="05"
                stage="app"
            >
                <ViewerSpecimen repost screen="05-repost" />
            </Specimen>
        </ComponentPage>
    );
}
