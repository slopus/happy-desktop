import { useState } from "react";
import { Sidebar, type SidebarItem } from "../../src/Sidebar";
import { StoriesRow } from "../../src/StoriesRow";
import { StoryViewer, type StoryViewerReply } from "../../src/StoryViewer";
import clip from "../../src/assets/animations/chief-of-staff.mp4?url";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";

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

/** A white app screenshot, the brightest frame a reply field sits on. */
const WHITE = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1600">
        <rect width="900" height="1600" fill="#ffffff"/>
        <rect x="60" y="180" width="520" height="40" rx="8" fill="#e9e9ee"/>
        <rect x="60" y="260" width="780" height="22" rx="6" fill="#f1f1f4"/>
        <rect x="60" y="300" width="700" height="22" rx="6" fill="#f1f1f4"/>
        <rect x="60" y="380" width="780" height="420" rx="16" fill="#f6f6f8"/>
        <rect x="60" y="1460" width="780" height="72" rx="36" fill="#f4f4f6"/>
    </svg>`,
)}`;

/** Colour bars: saturated, busy and bright to the bottom edge. */
const BARS = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1600">${[
        "#ffffff",
        "#ffff00",
        "#00ffff",
        "#00ff00",
        "#ff00ff",
        "#ff0000",
        "#0000ff",
    ]
        .map((fill, index) => `<rect x="${index * 129}" width="130" height="1600" fill="${fill}"/>`)
        .join("")}</svg>`,
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

function ViewerSpecimen(props: {
    readonly screen?: string;
    readonly repost?: boolean;
    readonly composer?: boolean;
    readonly replyCount?: number;
    readonly media?: string;
    readonly window?: { width: number; height: number };
}) {
    const [index, setIndex] = useState(1);
    const all =
        props.replyCount === undefined
            ? REPLIES
            : Array.from({ length: props.replyCount }, (_, index) => ({
                  ...REPLIES[index % REPLIES.length]!,
                  id: String(index),
              }));
    const [replies, setReplies] = useState(all.slice(-2));
    return (
        <div
            data-screen={props.screen}
            style={{
                contain: "layout",
                height: props.window?.height ?? 640,
                position: "relative",
                width: props.window?.width ?? 900,
            }}
        >
            <StoryViewer
                caption="Onboarding now opens on the welcome screen, with setup one click away."
                media={{ kind: "image", url: props.media ?? FRAME }}
                onClose={() => setIndex(1)}
                onDelete={() => undefined}
                onRepliesOpen={() => setReplies(all)}
                onReplySend={() => undefined}
                onRepost={async () => true}
                {...(props.composer
                    ? { onPost: async () => true }
                    : { layers: { text: { text: "Ready to ship 🚀", x: 0.5, y: 0.4 } } })}
                onChatOpen={() => undefined}
                onStep={(delta) => setIndex((at) => Math.min(2, Math.max(0, at + delta)))}
                poster={
                    props.repost
                        ? { name: "Kirill", face: { initials: "K", tone: "ocean" } }
                        : { name: "Desktop onboarding", face: { initials: "KD", type: "agent" } }
                }
                replies={replies}
                replyCount={all.length}
                roundUrl={clip}
                {...(props.repost
                    ? {
                          repost: {
                              from: {
                                  name: "Desktop onboarding",
                                  face: { initials: "DO", type: "agent" },
                              },
                              roundUrl: null,
                          },
                      }
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
            width={1540}
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
                        create={{
                            id: "p",
                            face: { initials: "K", tone: "ocean" },
                            onPick: () => undefined,
                        }}
                    />
                </div>
            </Specimen>
            <Specimen
                number="12"
                label="Your Story — no live story"
                detail="Your avatar has no ring · the accent plus opens the gallery"
                stage="chrome"
            >
                <div data-screen="12-your-story-empty" style={{ width: 260 }}>
                    <StoriesRow
                        items={[
                            {
                                id: "a",
                                name: "Desktop onboarding",
                                face: { initials: "KD", type: "agent" },
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
                        create={{
                            id: "p",
                            face: { initials: "K", tone: "ocean" },
                            onPick: () => undefined,
                        }}
                    />
                </div>
            </Specimen>
            {[
                { width: 1440, height: 900 },
                { width: 1100, height: 760 },
            ].map((window) => (
                <FullScreenSpecimen
                    key={window.width}
                    number="06"
                    label="Story composer"
                    detail="One composer · Text and Camera · bare Post"
                    window={window}
                    screen={`06-composer-${window.width}x${window.height}`}
                >
                    <ViewerSpecimen composer window={window} />
                </FullScreenSpecimen>
            ))}
            {[
                { width: 1440, height: 900 },
                { width: 1100, height: 760 },
            ].map((window) => (
                <FullScreenSpecimen
                    key={window.width}
                    number="07"
                    label="Window viewer"
                    detail="Full-window story and replies"
                    window={window}
                    screen={`07-viewer-${window.width}x${window.height}`}
                >
                    <ViewerSpecimen window={window} />
                </FullScreenSpecimen>
            ))}
            <Specimen
                detail="Original agent attribution · the person’s circle"
                label="Viewer — repost"
                number="05"
                stage="app"
            >
                <ViewerSpecimen repost screen="05-repost" />
            </Specimen>
            <FullScreenSpecimen
                number="08"
                label="Window repost"
                detail="Original agent avatar opens its chat"
                window={{ width: 1440, height: 900 }}
                screen="08-repost-1440x900"
            >
                <ViewerSpecimen repost window={{ width: 1440, height: 900 }} />
            </FullScreenSpecimen>
            {[
                { media: WHITE, name: "white", label: "a white screenshot" },
                { media: BARS, name: "bars", label: "colour bars" },
            ].map((bright) => (
                <FullScreenSpecimen
                    key={bright.name}
                    number="11"
                    label={`Reply over ${bright.label}`}
                    detail="The reply field stays legible on the brightest media"
                    window={{ width: 1100, height: 760 }}
                    screen={`11-${bright.name}-1100x760`}
                >
                    <ViewerSpecimen
                        media={bright.media}
                        replyCount={0}
                        window={{ width: 1100, height: 760 }}
                    />
                </FullScreenSpecimen>
            ))}
            {[1, 40].flatMap((count) =>
                [
                    { width: 1440, height: 900 },
                    { width: 1100, height: 760 },
                ].map((window) => (
                    <FullScreenSpecimen
                        key={`${count}-${window.width}`}
                        number={count === 1 ? "09" : "10"}
                        label={count === 1 ? "One reply" : "Many replies"}
                        detail="The inline reply list expands above the fixed reply field"
                        window={window}
                        screen={`${count === 1 ? "09-one" : "10-many"}-${window.width}x${window.height}`}
                    >
                        <ViewerSpecimen replyCount={count} window={window} />
                    </FullScreenSpecimen>
                )),
            )}
        </ComponentPage>
    );
}
