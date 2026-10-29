import "./styles.css";
import { useState } from "react";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Sidebar, type SidebarItem } from "./Sidebar";
import type { StoryArtifactTarget } from "./StoryCanvas";
import { StoryViewer } from "./StoryViewer";
import type { Story, StoryFrame } from "./storyTypes";
import { createRenderer } from "./testing";

/*
 * Agent stories, as the person meets them: a conversation's row wears its
 * agent's ring and one corner signal, the ring opens the stories and the text
 * the chat; in the viewer an agent's story takes feedback for the agent,
 * pauses with Space and while the field is in use, scrubs with Shift-scroll
 * and steps past either end, draws an artifact frame as a live page, and
 * offers a repost.
 */

const at = (x: number, y: number, scale: number) => ({ x, y, scale, rotation: 0 });

function frame(id: string, kind: "image" | "artifact"): StoryFrame {
    return {
        id,
        kind,
        width: kind === "image" ? 1080 : null,
        height: kind === "image" ? 1920 : null,
        thumbhash: null,
        durationMs: null,
        asset:
            kind === "image"
                ? { type: "artifact_file", artifactId: "story", version: 1, path: `${id}.png` }
                : { type: "artifact", artifactId: "board" },
        available: true,
        placement: at(0.5, 0.5, 1),
        background: ["#223344", "#112233"],
        overlays: [],
    };
}

const AGENT_STORY: Story = {
    id: "agent-story",
    status: "posted",
    authorUserId: "owner",
    createdBy: { kind: "agent", agentId: "agent-1" },
    author: { kind: "agent", agentId: "agent-1" },
    ringAgentId: "agent-1",
    source: null,
    caption: null,
    frames: [frame("f-photo", "image"), frame("f-page", "artifact")],
    audience: "team",
    artifactVersion: 1,
    createdAt: 0,
    updatedAt: 0,
    postedAt: Date.now() - 60_000,
    expiresAt: null,
    seen: false,
    viewCount: null,
    myReaction: null,
    reactions: [],
    version: "1",
};

// A transparent pixel stands in for the photo, so nothing waits on the network.
const PIXEL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

it("draws a conversation's row with its ring and one corner signal; the ring opens stories, the text the chat", async () => {
    const acts: string[] = [];
    const items: SidebarItem[] = [
        {
            id: "waiting",
            kind: "project",
            icon: "doc",
            label: "Release",
            status: "awaitingInput",
            unread: true,
            story: {
                subtitle: "Ready for a test build. Send it?",
                ring: { total: 2, unseen: 1 },
                signal: "unread",
            },
        },
        {
            id: "working",
            kind: "project",
            icon: "doc",
            label: "Benchmarks",
            status: "working",
            story: { subtitle: "Running the third pass", signal: "working" },
        },
    ];
    const view = createRenderer();
    view.render(
        () => (
            <Sidebar
                activeItemId=""
                data-testid="story-rows"
                onItemSelect={(id) => acts.push(`open:${id}`)}
                onItemStoryOpen={(id) => acts.push(`stories:${id}`)}
                sections={[{ id: "spaces", items }]}
                style={{ width: 300, height: 240 }}
            />
        ),
        { width: 320, height: 260 },
    );
    await view.ready();
    const root = view.$('[data-testid="story-rows"]').element;
    const row = (id: string) =>
        root.querySelector<HTMLElement>(
            `[data-happy-desktop-ui="sidebar-item"][data-item-id="${id}"]`,
        )!;

    // The title, then the agent's status under it.
    expect(row("waiting").getBoundingClientRect().height).toBe(64);
    expect(row("waiting").textContent).toContain("Ready for a test build. Send it?");

    // One corner signal per row, never a second dot.
    const corners = (id: string) =>
        [
            ...row(id).querySelectorAll<HTMLElement>(
                '[data-happy-desktop-ui="sidebar-item-corner"]',
            ),
        ].map((corner) => corner.dataset.signal);
    expect(corners("waiting")).toEqual(["unread"]);
    expect(corners("working")).toEqual(["working"]);
    expect(
        row("waiting").querySelector('[data-happy-desktop-ui="sidebar-item-unread"]'),
    ).toBeNull();

    // A row with stories opens them from its ring; one without has no ring to press.
    const ring = row("waiting").querySelector<HTMLElement>('[data-happy-desktop-ui="story-ring"]')!;
    expect(ring.dataset.opens).toBe("");
    expect(ring.dataset.unseen).toBe("");
    expect(
        row("working").querySelector('[data-happy-desktop-ui="story-ring"][data-opens]'),
    ).toBeNull();

    await userEvent.click(ring);
    expect(acts).toEqual(["stories:waiting"]);
    await userEvent.click(
        row("waiting").querySelector<HTMLElement>(".happy-sidebar__item-subtitle")!,
    );
    expect(acts).toEqual(["stories:waiting", "open:waiting"]);
});

it("keeps every story row one height with its name on one line, whatever the status and signal say", async () => {
    const LONG =
        "Ready for a test build once the last two crash reports are triaged and the changelog is short enough to read in one go";
    const statuses = { none: undefined, one: "Running the third pass", two: LONG } as const;
    const signals = { idle: undefined, working: "working", unread: "unread" } as const;
    const grid: SidebarItem[] = Object.entries(statuses).flatMap(([lines, subtitle]) =>
        Object.entries(signals).map(([signal, value]) => ({
            id: `${lines}-${signal}`,
            kind: "project" as const,
            icon: "doc" as const,
            label: `Status ${lines} ${signal}`,
            story: {
                ...(subtitle === undefined ? {} : { subtitle, time: "14:05" }),
                ...(value === undefined ? {} : { signal: value }),
                ...(lines === "one" ? { ring: { total: 1, unseen: 1 } } : {}),
            },
        })),
    );
    const surface: SidebarItem = {
        id: "surface",
        kind: "project",
        icon: "doc",
        label: "A Surface",
        story: {},
    };
    let live: SidebarItem["story"] = {};
    let rerender = () => undefined as void;
    function Rows() {
        const [, setTick] = useState(0);
        rerender = () => setTick((tick) => tick + 1);
        const liveRow: SidebarItem = {
            id: "live",
            kind: "project",
            icon: "doc",
            label: "Live",
            story: live,
        };
        return (
            <Sidebar
                activeItemId=""
                data-testid="story-states"
                onItemSelect={() => undefined}
                sections={[{ id: "states", items: [liveRow, ...grid, surface] }]}
                style={{ width: 300, height: 820 }}
            />
        );
    }
    const view = createRenderer();
    view.render(() => <Rows />, { width: 320, height: 840 });
    await view.ready();
    const root = view.$('[data-testid="story-states"]').element;
    const row = (id: string) =>
        root.querySelector<HTMLElement>(
            `[data-happy-desktop-ui="sidebar-item"][data-item-id="${id}"]`,
        )!;
    const part = (id: string, name: string) =>
        row(id).querySelector<HTMLElement>(`[data-happy-desktop-ui="${name}"]`)!;
    /*
     * Where a row's pieces stand, measured from the row's own top-left. Kept to
     * a hundredth of a pixel: the engines report a row lower in the list
     * through float sums that differ in the last bits, which is not a move.
     */
    const px = (value: number) => Math.round(value * 100) / 100;
    const geometry = (id: string) => {
        const box = row(id).getBoundingClientRect();
        const of = (name: string) => {
            const rect = part(id, name).getBoundingClientRect();
            return {
                x: px(rect.left - box.left),
                y: px(rect.top - box.top),
                height: px(rect.height),
            };
        };
        return {
            height: px(box.height),
            label: of("sidebar-item-label"),
            subtitle: of("sidebar-item-subtitle"),
            leading: of("sidebar-item-leading"),
        };
    };

    // Every combination, and a Surface with no agent, has one geometry.
    const reference = geometry("none-idle");
    expect(reference.height).toBe(64);
    expect(reference.leading.y + reference.leading.height / 2).toBe(32);
    for (const id of [...grid.map((item) => item.id), "surface", "live"])
        expect({ id, ...geometry(id) }).toEqual({ id, ...reference });

    // A long status fills the two reserved lines and ends in an ellipsis.
    const long = part("two-idle", "sidebar-item-subtitle");
    expect(px(long.getBoundingClientRect().height)).toBe(32);
    expect(long.scrollHeight).toBeGreaterThan(long.clientHeight);
    expect(getComputedStyle(long).getPropertyValue("-webkit-line-clamp")).toBe("2");
    expect(part("two-idle", "sidebar-item-time").textContent).toBe("14:05");
    expect(
        row("none-idle").querySelector('[data-happy-desktop-ui="sidebar-item-time"]'),
    ).toBeNull();

    // The status coming, growing, its signal toggling and the status going
    // again never move the name, the row, or the row under it.
    const settled = { live: geometry("live"), next: row("none-idle").getBoundingClientRect().top };
    for (const story of [
        { subtitle: "Starting", time: "14:06" },
        { subtitle: LONG, time: "14:07", signal: "working" as const },
        {
            subtitle: LONG,
            time: "14:08",
            signal: "unread" as const,
            ring: { total: 1, unseen: 1 },
        },
        {},
    ]) {
        live = story;
        rerender();
        await expect
            .poll(() => part("live", "sidebar-item-subtitle").textContent)
            .toBe("subtitle" in story ? story.subtitle : "");
        expect(geometry("live")).toEqual(settled.live);
        expect(row("none-idle").getBoundingClientRect().top).toBe(settled.next);
    }

    // Cards are parted by space alone: no row draws a hairline.
    const hairline = (id: string) =>
        getComputedStyle(part(id, "sidebar-item-body"), "::before").content;
    expect(hairline("none-idle")).toBe("none");
    expect(hairline("live")).toBe("none");
});

it("takes feedback for the agent, pauses, scrubs, shows a live page, and offers a repost", async () => {
    const feedback: { storyId: string; frameId: string; text: string }[] = [];
    const reposted: string[] = [];
    const pages: StoryArtifactTarget[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <StoryViewer
                artifactRender={(target) => {
                    pages.push(target);
                    return {
                        type: "page",
                        page: <div data-testid="live-page">Release board</div>,
                    };
                }}
                authors={[
                    {
                        id: "agent:agent-1",
                        name: "Release",
                        initials: "RE",
                        self: false,
                        stories: [AGENT_STORY],
                    },
                ]}
                frameUrl={() => PIXEL}
                onClose={() => {}}
                onFeedback={(story, frameId, text) => {
                    feedback.push({ storyId: story.id, frameId, text });
                    return Promise.resolve();
                }}
                onLinkOpen={() => {}}
                onReact={() => {}}
                onRepost={(story) => reposted.push(story.id)}
                onSeen={() => {}}
                postedLabel={() => "1m ago"}
                startAuthorId="agent:agent-1"
                sticker={() => undefined}
            />
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();
    const room = document.querySelector<HTMLElement>('[data-happy-desktop-ui="story-viewer"]')!;
    const playing = () =>
        document.querySelector<HTMLElement>(
            '.happy-story-viewer__segment-fill[data-state="playing"]',
        )!;
    const playState = () => playing().style.animationPlayState;
    const shownFrame = () =>
        [...document.querySelectorAll(".happy-story-viewer__segment-fill")].findIndex(
            (fill) => fill.getAttribute("data-state") === "playing",
        );
    expect(shownFrame()).toBe(0);
    expect(playState()).toBe("running");

    // Space pauses and resumes.
    room.focus();
    await userEvent.keyboard(" ");
    expect(playState()).toBe("paused");
    await userEvent.keyboard(" ");
    expect(playState()).toBe("running");

    // Writing to the agent holds the story; Enter sends it, quoting the frame.
    const input = view.$('[data-testid="story-viewer-feedback-input"]').element as HTMLInputElement;
    await userEvent.click(input);
    // Focus can land a moment after the click under a loaded Firefox.
    await expect.poll(() => document.activeElement).toBe(input);
    await expect.poll(playState).toBe("paused");
    await userEvent.keyboard("Make the chart bigger");
    // The field keeps its keys: Space typed there never resumed the story.
    expect(playState()).toBe("paused");
    await userEvent.keyboard("{Enter}");
    await expect
        .poll(() => feedback)
        .toEqual([{ storyId: "agent-story", frameId: "f-photo", text: "Make the chart bigger" }]);
    await expect.poll(() => input.placeholder).toBe("Sent");
    expect(input.value).toBe("");
    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).not.toBe(input);
    expect(playState()).toBe("running");

    // Shift-scrolling moves through the frame, and on past its end to the next.
    const stage = document.querySelector<HTMLElement>(".happy-story-viewer__stage")!;
    // Each turn lands before the next, as a wheel's do.
    const wheel = async (deltaX: number) => {
        stage.dispatchEvent(
            new WheelEvent("wheel", { deltaX, shiftKey: true, bubbles: true, cancelable: true }),
        );
        await new Promise((resolve) => requestAnimationFrame(resolve));
    };
    /** Turns the wheel until the story leaves the frame on screen. */
    const wheelPast = async (deltaX: number) => {
        const from = shownFrame();
        for (let turn = 0; turn < 12 && shownFrame() === from; turn += 1) await wheel(deltaX);
    };
    await wheel(100);
    const scrubbed = Number(playing().getAnimations()[0]?.currentTime ?? 0);
    expect(scrubbed).toBeGreaterThanOrEqual(1100);
    await wheelPast(200);
    expect(shownFrame()).toBe(1);

    // The artifact frame is its live page.
    await expect.poll(() => document.querySelector('[data-testid="live-page"]')).not.toBeNull();
    expect(pages.at(-1)).toEqual({ artifactId: "board" });

    // Scrolling back past the start returns to the photo.
    await wheelPast(-200);
    expect(shownFrame()).toBe(0);

    await userEvent.click(view.$('[data-testid="story-viewer-repost"]').element);
    expect(reposted).toEqual(["agent-story"]);
});
