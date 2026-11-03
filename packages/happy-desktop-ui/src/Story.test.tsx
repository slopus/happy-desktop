import "./styles.css";
import { useState } from "react";
import { flushSync } from "react-dom";
import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Sidebar, type SidebarItem } from "./Sidebar";
import { StoriesRow } from "./StoriesRow";
import { roundMimeType, StoryViewer, type StoryViewerProps } from "./StoryViewer";
import { createRenderer } from "./testing";
import clip from "./assets/animations/chief-of-staff.mp4?url";

const PIXEL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const rows = (story?: { a?: SidebarItem["story"]; b?: SidebarItem["story"] }): SidebarItem[] => [
    {
        id: "a",
        initials: "AB",
        kind: "project",
        label: "Task A",
        ...(story?.a && { story: story.a }),
    },
    {
        id: "b",
        initials: "CD",
        kind: "project",
        label: "Bot B",
        ...(story?.b && { story: story.b }),
    },
    { id: "c", initials: "EF", kind: "project", label: "Task C" },
];

function sidebar(items: SidebarItem[], log: string[]) {
    const view = createRenderer();
    view.render(
        () => (
            <Sidebar
                activeItemId=""
                data-testid="sidebar"
                onItemSelect={(id) => log.push(`select ${id}`)}
                onItemStoryOpen={(id) => log.push(`story ${id}`)}
                sections={[{ id: "tasks", items, label: "Tasks" }]}
                style={{ width: 280 }}
            />
        ),
        { width: 304, height: 240 },
    );
    return view;
}

const ui = (root: ParentNode, name: string) => [
    ...root.querySelectorAll<HTMLElement>(`[data-happy-desktop-ui="${name}"]`),
];
const boxes = (root: Element) =>
    ui(root, "sidebar-item").map((row) =>
        [row, ...row.querySelectorAll(".happy-avatar, .happy-sidebar__item-label")].map((el) => {
            const r = el.getBoundingClientRect();
            return [r.x, r.y, r.width, r.height];
        }),
    );

it("draws no outline without a story, and an outline moves nothing", async () => {
    const plain = sidebar(rows(), []);
    await plain.ready();
    const plainRoot = plain.$('[data-testid="sidebar"]').element;
    expect(ui(plainRoot, "sidebar-item-story")).toHaveLength(0);
    const before = boxes(plainRoot);
    const plainHtml = plainRoot.innerHTML;
    plain.destroy();

    const outlined = sidebar(rows({ a: "unseen", b: "seen" }), []);
    await outlined.ready();
    const root = outlined.$('[data-testid="sidebar"]').element;
    expect(boxes(root)).toEqual(before);
    // The row without a story is the same markup as before.
    const third = (html: string) => {
        const host = document.createElement("div");
        host.innerHTML = html;
        return host.querySelector('[data-item-id="c"]')!.outerHTML;
    };
    expect(third(root.innerHTML)).toBe(third(plainHtml));
    outlined.destroy();
});

it("outlines the tile in the accent while unseen and in grey once seen", async () => {
    const view = sidebar(rows({ a: "unseen", b: "seen" }), []);
    await view.ready();
    const root = view.$('[data-testid="sidebar"]').element;
    const [unseen, seen] = ui(root, "sidebar-item-story");
    expect(unseen!.hasAttribute("data-seen")).toBe(false);
    expect(seen!.hasAttribute("data-seen")).toBe(true);
    const tileOf = (hit: HTMLElement) =>
        hit.parentElement!.querySelector<HTMLElement>(".happy-avatar")!;
    const accent = getComputedStyle(root).getPropertyValue("--radio-active").trim();
    const probe = document.createElement("span");
    probe.style.color = accent;
    root.append(probe);
    const unseenTile = getComputedStyle(tileOf(unseen!));
    expect(unseenTile.outlineColor).toBe(getComputedStyle(probe).color);
    probe.remove();
    expect(unseenTile.outlineStyle).toBe("solid");
    // 1.5px each, which an engine at 1x may snap to a whole pixel.
    expect(parseFloat(unseenTile.outlineWidth)).toBeGreaterThanOrEqual(1);
    expect(parseFloat(unseenTile.outlineOffset)).toBeGreaterThanOrEqual(1);
    const seenTile = getComputedStyle(tileOf(seen!));
    expect(seenTile.outlineStyle).toBe("solid");
    expect(seenTile.outlineColor).not.toBe(unseenTile.outlineColor);
    // The tile's own rounded square, so the outline follows its corners.
    expect(unseenTile.borderTopLeftRadius).toBe("6px");
    // The hit area is a 26px square on the tile's centre.
    const tile = tileOf(unseen!).getBoundingClientRect();
    const hit = unseen!.getBoundingClientRect();
    expect(hit.width).toBeCloseTo(26, 1);
    expect(hit.x + hit.width / 2).toBeCloseTo(tile.x + tile.width / 2, 1);
    expect(hit.y + hit.height / 2).toBeCloseTo(tile.y + tile.height / 2, 1);
    // A row without a story wears no outline.
    const plain = root.querySelector('[data-item-id="c"] .happy-avatar')!;
    expect(getComputedStyle(plain).outlineStyle).toBe("none");
    view.destroy();
});

it("opens the story from the outline and the chat from the rest of the row", async () => {
    const log: string[] = [];
    const view = sidebar(rows({ a: "unseen" }), log);
    await view.ready();
    const root = view.$('[data-testid="sidebar"]').element;
    await userEvent.click(ui(root, "sidebar-item-story")[0]!);
    expect(log).toEqual(["story a"]);
    await userEvent.click(root.querySelector('[data-item-id="a"] .happy-sidebar__item-label')!);
    expect(log).toEqual(["story a", "select a"]);
    view.destroy();
});

it("puts the stories row first in the scrolling list, so it scrolls away with the rows, and leaves no gap when off", async () => {
    const items: SidebarItem[] = Array.from({ length: 20 }, (_, index) => ({
        id: `t${String(index)}`,
        initials: "T",
        kind: "project",
        label: `Task ${String(index)}`,
    }));
    const stories = (on: boolean) => {
        const view = createRenderer();
        view.render(
            () => (
                <Sidebar
                    activeItemId=""
                    data-testid="sidebar"
                    onItemSelect={() => undefined}
                    {...(on
                        ? {
                              bodyLeading: (
                                  <StoriesRow
                                      items={[
                                          {
                                              id: "a",
                                              name: "Agent",
                                              face: { initials: "A", type: "agent" },
                                              state: "unseen",
                                          },
                                      ]}
                                      onOpen={() => undefined}
                                      create={{
                                          id: "me",
                                          face: { initials: "M" },
                                          onPick: () => undefined,
                                      }}
                                  />
                              ),
                          }
                        : {})}
                    sections={[{ id: "tasks", items, label: "Tasks" }]}
                    style={{ height: 320, width: 280 }}
                />
            ),
            { width: 304, height: 340 },
        );
        return view;
    };
    const off = stories(false);
    await off.ready();
    const offRoot = off.$('[data-testid="sidebar"]').element;
    expect(ui(offRoot, "sidebar-body-leading")).toHaveLength(0);
    const firstRowOff = ui(offRoot, "sidebar-item")[0]!.getBoundingClientRect().top;
    off.destroy();

    const on = stories(true);
    await on.ready();
    const root = on.$('[data-testid="sidebar"]').element;
    const content = ui(root, "sidebar-body-content")[0]!;
    const leading = ui(root, "sidebar-body-leading")[0]!;
    const row = ui(root, "stories-row")[0]!;
    expect(content.firstElementChild).toBe(leading);
    expect(leading.contains(row)).toBe(true);
    expect(ui(root, "sidebar-header-accessory")).toHaveLength(0);
    // Edge to edge at the scrollport's top, with the rows below it as before.
    const viewport = content.closest<HTMLElement>(".happy-sidebar__body-viewport")!;
    const port = viewport.getBoundingClientRect();
    const box = row.getBoundingClientRect();
    expect(box.top).toBeCloseTo(port.top, 0);
    expect(row.parentElement!.getBoundingClientRect().width).toBeCloseTo(port.width, 0);
    expect(ui(root, "sidebar-item")[0]!.getBoundingClientRect().top).toBeCloseTo(
        firstRowOff + leading.getBoundingClientRect().height,
        0,
    );
    // Its own scroll stays horizontal.
    expect(getComputedStyle(row.parentElement!).overflowX).toBe("auto");

    viewport.scrollTop = 120;
    viewport.dispatchEvent(new Event("scroll"));
    await expect.poll(() => row.getBoundingClientRect().top).toBeCloseTo(box.top - 120, 0);
    expect(row.getBoundingClientRect().bottom).toBeLessThan(port.top);
    on.destroy();
});

const ROUND: NonNullable<StoryViewerProps["mediaLayers"]>[number] = {
    id: "round",
    kind: "video",
    url: clip,
    shape: "round",
    x: 0.2,
    y: 0.2,
    width: 0.3,
    aspect: 1,
};

const reply = (id: string, text: string) => ({
    id,
    name: `Person ${id}`,
    face: { initials: id.toUpperCase() },
    text,
});

function viewer(log: string[], overrides: Partial<StoryViewerProps> = {}) {
    const props: StoryViewerProps = {
        id: "s1",
        caption: "Shipped the onboarding",
        media: { kind: "image", url: PIXEL },
        onClose: () => log.push("close"),
        onRepliesOpen: () => log.push("replies"),
        onReplySend: (text) => log.push(`reply ${text}`),
        onStep: (delta) => log.push(`step ${delta}`),
        poster: { name: "Task A", face: { initials: "TA", type: "agent" } },
        replies: [],
        replyCount: 0,
        segment: { index: 1, total: 3 },
        time: "5m",
        ...overrides,
    };
    const view = createRenderer();
    view.render(() => <StoryViewer {...props} />, { width: 800, height: 600 });
    return view;
}

it("shows the poster, time, caption and segments; its halves step and it closes", async () => {
    const log: string[] = [];
    const view = viewer(log);
    await view.ready();
    const dialog = view.$('[data-happy-desktop-ui="story-viewer"]').element;
    expect(dialog.getAttribute("aria-label")).toBe("Task A’s story");
    expect(dialog.textContent).toContain("Shipped the onboarding");
    expect(dialog.textContent).toContain("5m");
    expect(document.activeElement).toBe(dialog);
    const segments = [...dialog.querySelectorAll(".happy-story-viewer__segments > span")];
    expect(segments.map((each) => each.hasAttribute("data-on"))).toEqual([true, true, false]);
    const frame = view.$('[data-happy-desktop-ui="story-viewer-frame"]').element;
    const { width, height } = frame.getBoundingClientRect();
    expect(width / height).toBeCloseTo(9 / 16, 2);
    // The media's box fills the frame, but its contents are never cropped.
    const media = dialog.querySelector<HTMLElement>(".happy-story-viewer__media")!;
    expect(getComputedStyle(media).objectFit).toBe("contain");
    expect(media.getBoundingClientRect().width).toBeCloseTo(width, 0);

    await userEvent.click(view.$('[aria-label="Next story"]').element);
    await userEvent.click(view.$('[aria-label="Previous story"]').element);
    await userEvent.click(view.$('[aria-label="Close story"]').element);
    await userEvent.keyboard("{Escape}");
    expect(log).toEqual(["step 1", "step -1", "close", "close"]);
    view.destroy();
});

it("takes focus only when it mounts", async () => {
    let rerender = () => undefined as void;
    function Viewer() {
        const [caption, captionSet] = useState("one");
        rerender = () => captionSet((previous) => `${previous}!`);
        return (
            <StoryViewer
                id="s1"
                caption={caption}
                media={{ kind: "image", url: PIXEL }}
                onClose={() => undefined}
                onRepliesOpen={() => undefined}
                onReplySend={() => undefined}
                onStep={() => undefined}
                poster={{ name: "Task A", face: { initials: "TA" } }}
                replies={[]}
                replyCount={0}
                segment={{ index: 0, total: 1 }}
                time="now"
            />
        );
    }
    const view = createRenderer();
    view.render(() => <Viewer />, { width: 800, height: 600 });
    await view.ready();
    const close = view.$('[aria-label="Close story"]').element as HTMLElement;
    close.focus();
    flushSync(rerender);
    expect(view.$('[data-happy-desktop-ui="story-viewer"]').element.textContent).toContain("one!");
    expect(document.activeElement).toBe(close);
    view.destroy();
});

it("dismisses a downward swipe from anywhere, by mouse or touch, with one close control", async () => {
    for (const [selector, pointerType] of [
        [".happy-story-viewer__media", "mouse"],
        [".happy-story-viewer__head", "mouse"],
        ['[aria-label="Next story"]', "mouse"],
        ['[aria-label="Reply"]', "touch"],
    ] as const) {
        const log: string[] = [];
        const view = viewer(log);
        await view.ready();
        const dialog = view.$('[data-happy-desktop-ui="story-viewer"]').element;
        expect(
            dialog.querySelectorAll('[aria-label="Close story"], [aria-label="Close"]'),
        ).toHaveLength(1);
        const target = view.$(selector).element;
        const at = (type: string, x: number, y: number) =>
            target.dispatchEvent(
                new PointerEvent(type, { bubbles: true, pointerType, clientX: x, clientY: y }),
            );
        // Sideways, or not far enough, stays; far enough down closes before the pointer lifts.
        at("pointerdown", 200, 100);
        at("pointermove", 300, 160);
        at("pointerup", 300, 160);
        at("pointerdown", 200, 100);
        at("pointermove", 200, 150);
        expect(log).toEqual([]);
        at("pointermove", 200, 180);
        expect(log).toEqual(["close"]);
        view.destroy();
    }
});

it("dismisses a trackpad swipe down, but not a sideways one or one the replies took", async () => {
    const log: string[] = [];
    const view = viewer(log);
    await view.ready();
    const media = view.$(".happy-story-viewer__media").element;
    media.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaX: -200, deltaY: -10 }));
    expect(log).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    for (let step = 0; step < 4; step++)
        media.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -50 }));
    expect(log).toEqual(["close"]);
    view.destroy();
});

it("contains mismatched media over its stretched ambient sample and keeps thousands of stories bounded", async () => {
    const view = viewer([], {
        media: { kind: "video", url: clip, ambient: PIXEL },
        segment: { index: 500, total: 1000 },
    });
    await view.ready();
    expect(getComputedStyle(view.$(".happy-story-viewer__media").element).objectFit).toBe(
        "contain",
    );
    const backdrop = view.$(".happy-story-viewer__viewport .happy-story-viewer__backdrop").element;
    expect(backdrop.getAttribute("src")).toBe(PIXEL);
    expect(getComputedStyle(backdrop).filter).toBe("none");
    // Fetched ahead: nothing says it is loading.
    expect((view.$(".happy-story-viewer__status").element as HTMLElement).hidden).toBe(true);
    expect(view.$(".happy-story-viewer__segments").element.children).toHaveLength(30);
    expect(view.$(".happy-story-viewer__segments").element.getAttribute("aria-label")).toBe(
        "Story 501 of 1000",
    );
    view.destroy();
});

it("fills the window with a full-height centered frame, outside chevrons and backdrop dismissal", async () => {
    const log: string[] = [];
    const view = viewer(log);
    await view.ready();
    const root = view.$('[data-happy-desktop-ui="story-viewer"]').element;
    const box = root.getBoundingClientRect();
    const frame = view
        .$('[data-happy-desktop-ui="story-viewer-frame"]')
        .element.getBoundingClientRect();
    expect(frame.height).toBeCloseTo(box.height - 24);
    expect(frame.y - box.y).toBeCloseTo(12);
    expect(frame.x + frame.width / 2).toBeCloseTo(box.x + box.width / 2);
    expect(
        view.$('[aria-label="Previous story"]').element.getBoundingClientRect().right,
    ).toBeLessThan(frame.left);
    expect(
        view.$('[aria-label="Next story"]').element.getBoundingClientRect().left,
    ).toBeGreaterThan(frame.right);
    expect(getComputedStyle(root, "::before").backgroundColor).toBe("rgba(0, 0, 0, 0.92)");
    root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(log).toEqual(["close"]);
    view.destroy();
});

it("shows a legible failure for a video that cannot play, and mutes and unmutes it", async () => {
    const log: string[] = [];
    const view = viewer(log, {
        media: { kind: "video", url: "data:video/mp4;base64,AAAA" },
        segment: { index: 0, total: 2 },
    });
    await view.ready();
    await expect
        .poll(() => view.$('[role="status"]').element.textContent)
        .toBe("This story could not be loaded.");
    expect(log).toEqual([]);
    const video = view.$(".happy-story-viewer__media").element as HTMLVideoElement;
    expect(video.muted).toBe(true);
    await userEvent.click(view.$('[aria-label="Unmute"]').element);
    expect(video.muted).toBe(false);
    view.destroy();
});

it("sends a reply and expands the inline preview without moving the frame or input", async () => {
    const log: string[] = [];
    const frameBox = async (overrides: Partial<StoryViewerProps>) => {
        const view = viewer(log, overrides);
        await view.ready();
        const box = view
            .$('[data-happy-desktop-ui="story-viewer-frame"]')
            .element.getBoundingClientRect();
        return { view, box: [box.x, box.y, box.width, box.height] };
    };
    const bare = await frameBox({});
    bare.view.destroy();
    const replies = [reply("a", "first"), reply("b", "second"), reply("c", "third")];
    const { view, box } = await frameBox({ replies: replies.slice(-2), replyCount: 3 });
    expect(box).toEqual(bare.box);

    const peek = view.$(".happy-story-viewer__peek").element;
    expect(peek.textContent).toContain("second");
    expect(peek.textContent).toContain("third");
    expect(peek.textContent).not.toContain("first");
    expect(peek.textContent).toContain("View all 3 replies");

    const input = view.$('[data-happy-desktop-ui="story-viewer-input"]')
        .element as HTMLInputElement;
    expect(input.placeholder).toBe("Reply to Task A…");
    await userEvent.type(input, "Make it blue{Enter}");
    expect(log).toEqual(["reply Make it blue"]);
    expect(input.value).toBe("");

    await userEvent.click(view.$('[data-happy-desktop-ui="story-viewer-peek"]').element);
    expect(log.at(-1)).toBe("replies");
    expect(view.$('[aria-label="Replies"]').element).toBe(peek);
    expect(view.$('[aria-label="Reply"]').element).toBe(input);
    await userEvent.click(view.$('[aria-label="Collapse replies"]').element);
    expect(view.$(".happy-story-viewer__peek").element).toBe(peek);
    expect(peek.textContent).toContain("View all 3 replies");
    view.destroy();
});

it("offers repost and delete from ⋯, and opens the original agent from its attribution", async () => {
    const log: string[] = [];
    const view = viewer(log, {
        onDelete: () => log.push("delete"),
        onRepost: async ({ text, mediaLayers }) => {
            log.push(`repost ${text?.text ?? ""} ${mediaLayers.length}`);
            return true;
        },
        repost: { from: { name: "Release bot", face: { initials: "RB", type: "agent" } } },
        onChatOpen: () => log.push("chat"),
    });
    await view.ready();
    await userEvent.click(named("button", "Release bot"));
    expect(log.splice(0)).toEqual(["chat"]);
    await userEvent.click(view.$('[aria-label="More"]').element);
    await userEvent.click(named('[role="menuitem"]', "Repost"));
    await userEvent.click(named("button", "Post"));
    expect(log).toEqual(["repost  0"]);
    await userEvent.click(view.$('[aria-label="More"]').element);
    await userEvent.click(named('[role="menuitem"]', "Delete"));
    await userEvent.click(named("button", "Delete"));
    expect(log.at(-1)).toBe("delete");
    view.destroy();
});

it("holds media, round and image progress still while ⋯ is open or confirming delete, and resumes when it closes untouched", async () => {
    for (const kind of ["image", "video"] as const) {
        const log: string[] = [];
        const view = viewer(log, {
            media: { kind, url: kind === "video" ? clip : PIXEL },
            mediaLayers: [ROUND],
            onDelete: () => log.push("delete"),
            onRepost: async () => true,
        });
        await view.ready();
        const frame = view.$(".happy-story-viewer__frame").element;
        const videos = [...frame.querySelectorAll("video")];
        const progress = frame.querySelector<HTMLElement>(".happy-story-viewer__progress");
        for (const video of videos) video.loop = true;
        const playing = async (expected: boolean) => {
            for (const video of videos) await expect.poll(() => video.paused).toBe(!expected);
            // A video layer paces an image story once its length is known.
            if (progress)
                await expect
                    .poll(() => progress.style.animationPlayState)
                    .toBe(expected ? "running" : "paused");
        };
        await playing(true);
        const more = view.$('[aria-label="More"]').element;

        await userEvent.click(more);
        await playing(false);
        await userEvent.keyboard("{Escape}");
        expect(more.getAttribute("aria-expanded")).toBe("false");
        await playing(true);

        await userEvent.click(more);
        await playing(false);
        await userEvent.click(view.$('[data-happy-desktop-ui="menu-button-backdrop"]').element);
        await playing(true);

        // Choosing Delete keeps it still until the confirm is answered, so it cannot step away.
        await userEvent.click(more);
        await userEvent.click(named('[role="menuitem"]', "Delete"));
        await playing(false);
        await userEvent.click(named("button", "Cancel"));
        await playing(true);
        expect(log).toEqual([]);
        view.destroy();
    }
});

it("keeps the reply field legible over bright media with a dark fill, hairline, shadow and scrim", async () => {
    const view = viewer([]);
    await view.ready();
    const input = view.$('[data-happy-desktop-ui="story-viewer-input"]')
        .element as HTMLInputElement;
    const field = getComputedStyle(input);
    expect(field.backgroundColor).toBe("rgba(0, 0, 0, 0.8)");
    expect(field.borderTopColor).toBe("rgba(255, 255, 255, 0.3)");
    expect(field.boxShadow).not.toBe("none");
    expect(field.color).toBe("rgb(255, 255, 255)");
    const scrim = getComputedStyle(view.$(".happy-story-viewer__bottom").element);
    expect(scrim.backgroundImage).toContain("linear-gradient");
    expect(scrim.backgroundImage).toContain("0.9");
    view.destroy();
});

/** A camera whose tracks say when they stop, and a recorder that takes only what `mp4` allows. */
function camera(mp4: boolean) {
    const canvas = document.createElement("canvas");
    const streams: MediaStream[] = [];
    const recorders: { state: string }[] = [];
    let grant: () => void = () => undefined;
    const granted = new Promise<void>((resolve) => (grant = resolve));
    const getUserMedia = vi.fn(async () => {
        await granted;
        const stream = canvas.captureStream();
        streams.push(stream);
        return stream;
    });
    vi.stubGlobal(
        "MediaRecorder",
        class {
            static isTypeSupported = (type: string) => mp4 && type.startsWith("video/mp4");
            state = "inactive";
            ondataavailable: ((event: { data: Blob }) => void) | null = null;
            onstop: (() => void) | null = null;
            constructor(
                _stream: MediaStream,
                readonly options: { mimeType: string },
            ) {
                recorders.push(this);
            }
            get mimeType() {
                return this.options.mimeType;
            }
            start() {
                this.state = "recording";
            }
            stop() {
                this.state = "inactive";
                this.ondataavailable?.({ data: new Blob(["x"], { type: this.mimeType }) });
                this.onstop?.();
            }
        },
    );
    Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia },
    });
    const live = () =>
        streams.some((stream) => stream.getTracks().some((track) => track.readyState === "live"));
    return { getUserMedia, grant, live, recorders };
}

afterEach(() => vi.unstubAllGlobals());

const named = (role: string, text: string) =>
    [...document.querySelectorAll<HTMLElement>(role)]
        .reverse()
        .find(
            (each) => each.getAttribute("aria-label") === text || each.textContent?.includes(text),
        )!;

async function repostOpen(log: string[], overrides: Partial<StoryViewerProps> = {}) {
    const view = viewer(log, {
        onDelete: () => log.push("delete"),
        onRepost: async () => true,
        ...overrides,
    });
    await view.ready();
    await userEvent.click(view.$('[aria-label="More"]').element);
    await userEvent.click(named('[role="menuitem"]', "Repost"));
    return view;
}

it("lets the camera go when the viewer closes mid-recording, or when cancelled before it opens", async () => {
    const cam = camera(true);
    cam.grant();
    const view = await repostOpen([]);
    await userEvent.click(named("button", "Camera"));
    await expect.poll(() => cam.live()).toBe(true);
    await userEvent.click(named("button", "Start recording"));
    await expect.poll(() => cam.recorders[0]?.state).toBe("recording");
    expect(cam.live()).toBe(true);
    view.destroy();
    expect(cam.live()).toBe(false);
    expect(cam.recorders[0]!.state).toBe("inactive");

    // The camera answers only after the reader cancelled: nothing records.
    const late = camera(true);
    const again = await repostOpen([]);
    await userEvent.click(named("button", "Camera"));
    await userEvent.keyboard("{Escape}");
    late.grant();
    await expect.poll(() => late.live()).toBe(false);
    expect(late.recorders).toHaveLength(0);
    again.destroy();
});

it("offers no recording without H.264 MP4, and keeps a refused repost to try again", async () => {
    const cam = camera(false);
    const log: string[] = [];
    const view = await repostOpen(log, {
        onRepost: async ({ text }) => {
            log.push(`repost ${text?.text ?? ""}`);
            return false;
        },
    });
    await userEvent.click(named("button", "Camera"));
    expect(document.body.textContent).toContain("No camera is available.");
    expect(cam.getUserMedia).not.toHaveBeenCalled();
    await userEvent.click(named("button", "Text"));
    const caption = view.$('[aria-label="Story text"]').element as HTMLInputElement;
    await userEvent.type(caption, "Look");
    await userEvent.click(named("button", "Post"));
    expect(log).toEqual(["repost Look"]);
    expect(
        view.$('[data-happy-desktop-ui="story-text-layer"] > button:first-child').element
            .textContent,
    ).toBe("Look");
    view.destroy();
});

it("records the round as MP4 when the recorder can", () => {
    expect(roundMimeType((type) => type.startsWith("video/mp4"))).toBe(
        "video/mp4;codecs=avc1,mp4a.40.2",
    );
    expect(roundMimeType(() => false)).toBeUndefined();
});

async function dragLayer(node: HTMLElement, dx: number, dy: number) {
    const box = node.getBoundingClientRect();
    for (const [type, x, y] of [
        ["pointerdown", 0, 0],
        ["pointermove", dx, dy],
        ["pointerup", dx, dy],
    ] as const) {
        node.dispatchEvent(
            new PointerEvent(type, {
                bubbles: true,
                pointerId: 1,
                clientX: box.x + box.width / 2 + x,
                clientY: box.y + box.height / 2 + y,
            }),
        );
        await new Promise(requestAnimationFrame);
    }
}

it("AC22 posts a bare repost, and carries dragged emoji text to the same normalized viewer position", async () => {
    const post = vi.fn(
        async (_draft: Parameters<NonNullable<StoryViewerProps["onRepost"]>>[0]) => true,
    );
    const view = await repostOpen([], { onRepost: post });
    await userEvent.click(named("button", "Post"));
    expect(post).toHaveBeenLastCalledWith({ mediaLayers: [] });
    await userEvent.click(view.$('[aria-label="More"]').element);
    await userEvent.click(named('[role="menuitem"]', "Repost"));
    await userEvent.click(named("button", "Text"));
    const input = view.$('[aria-label="Story text"]').element as HTMLInputElement;
    await page.getByRole("textbox", { name: "Story text" }).fill("Ready 🚀");
    input.blur();
    await new Promise(requestAnimationFrame);
    const frame = view
        .$('[data-happy-desktop-ui="story-viewer-frame"]')
        .element.getBoundingClientRect();
    await dragLayer(
        view.$('[data-happy-desktop-ui="story-text-layer"]').element as HTMLElement,
        frame.width * 0.2,
        frame.height * 0.1,
    );
    await userEvent.click(named("button", "Post"));
    const sent = post.mock.calls.at(-1)![0];
    expect(sent.text!.text).toBe("Ready 🚀");
    expect(sent.text!.x).toBeCloseTo(0.7);
    expect(sent.text!.y).toBeCloseTo(0.6);
    view.destroy();
    const other = viewer([], { text: sent.text! });
    await other.ready();
    const otherFrame = other
        .$('[data-happy-desktop-ui="story-viewer-frame"]')
        .element.getBoundingClientRect();
    const layer = other
        .$('[data-happy-desktop-ui="story-text-layer"]')
        .element.getBoundingClientRect();
    expect((layer.x + layer.width / 2 - otherFrame.x) / otherFrame.width).toBeCloseTo(0.7);
    expect((layer.y + layer.height / 2 - otherFrame.y) / otherFrame.height).toBeCloseTo(0.6);
    other.destroy();
});

it("AC23 previews without recording, restarts the base, replaces a take, and releases preview and recorder tracks", async () => {
    const cam = camera(true);
    cam.grant();
    const post = vi.fn(
        async (_draft: Parameters<NonNullable<StoryViewerProps["onRepost"]>>[0]) => true,
    );
    const view = await repostOpen([], { media: { kind: "video", url: clip }, onRepost: post });
    await userEvent.click(named("button", "Camera"));
    await expect.poll(() => cam.live()).toBe(true);
    expect(cam.recorders).toHaveLength(0);
    const stickerBox = view.$(".happy-story-viewer__sticker").element.getBoundingClientRect();
    const frameBox = view.$(".happy-story-viewer__frame").element.getBoundingClientRect();
    // Half the frame wide: twice the old 96px circle at the default window.
    expect(stickerBox.width).toBeCloseTo(frameBox.width * 0.5);
    const recordBox = view.$('[aria-label="Start recording"]').element.getBoundingClientRect();
    expect(recordBox.top).toBeLessThan(stickerBox.bottom);
    expect(recordBox.bottom).toBeGreaterThan(stickerBox.bottom);
    const base = view.$(".happy-story-viewer__media").element as HTMLVideoElement;
    await expect.poll(() => base.readyState).toBeGreaterThanOrEqual(2);
    expect(base.paused).toBe(true);
    const box = view
        .$('[data-happy-desktop-ui="story-viewer-frame"]')
        .element.getBoundingClientRect();
    const liveVideo = view.$(".happy-story-viewer__round").element as HTMLVideoElement;
    const playing = vi.spyOn(liveVideo, "play");
    const source = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "srcObject")!;
    const attached = vi.fn(source.set!.bind(liveVideo));
    Object.defineProperty(liveVideo, "srcObject", {
        configurable: true,
        get: () => source.get!.call(liveVideo),
        set: attached,
    });
    await dragLayer(
        view.$(".happy-story-viewer__sticker").element as HTMLElement,
        box.width * 0.2,
        box.height * 0.2,
    );
    expect(playing).not.toHaveBeenCalled();
    expect(attached).not.toHaveBeenCalled();
    base.currentTime = 1;
    await userEvent.click(named("button", "Start recording"));
    expect(base.currentTime).toBeLessThan(1);
    expect(base.paused).toBe(false);
    expect(cam.recorders[0]?.state).toBe("recording");
    expect(document.activeElement?.tagName).not.toBe("INPUT");
    const controls = [
        ...document.querySelectorAll<HTMLButtonElement>(
            '[data-happy-desktop-ui="story-viewer"] button:not([disabled]):not([hidden])',
        ),
    ].filter((node) => node.getBoundingClientRect().width > 0);
    expect(controls.map((node) => node.getAttribute("aria-label"))).toEqual(["Stop"]);
    await userEvent.click(view.$('[aria-label="Stop"]').element);
    expect(cam.live()).toBe(false);
    expect(base.paused).toBe(false);
    await userEvent.click(named("button", "Re-record"));
    await expect.poll(() => cam.recorders).toHaveLength(2);
    expect(cam.recorders[1]?.state).toBe("recording");
    await userEvent.click(view.$('[aria-label="Stop"]').element);
    await userEvent.click(named("button", "Post"));
    const [taken] = post.mock.calls[0]![0].mediaLayers;
    expect(taken).toMatchObject({ shape: "round", width: 0.5, aspect: 1 });
    expect(taken!.blob).toBeInstanceOf(Blob);
    expect(taken!.x).toBeCloseTo(0.7);
    expect(taken!.y).toBeCloseTo(0.65);
    await userEvent.click(named("button", "More"));
    await userEvent.click(named('[role="menuitem"]', "Repost"));
    await userEvent.click(named("button", "Camera"));
    await expect.poll(() => cam.live()).toBe(true);
    const resetPosition = view.$(".happy-story-viewer__sticker").element as HTMLElement;
    expect([resetPosition.style.left, resetPosition.style.top]).toEqual(["50%", "45%"]);
    await userEvent.click(view.$('[aria-label="Remove camera"]').element);
    expect(cam.live()).toBe(false);
    view.destroy();
});

it("AC25 pauses beneath inline replies, preserves the input and frame, and focuses the overlay", async () => {
    const chat = vi.fn();
    const view = viewer([], {
        media: { kind: "video", url: clip },
        replies: [reply("a", "Hello")],
        replyCount: 1,
        onChatOpen: chat,
    });
    await view.ready();
    const base = view.$(".happy-story-viewer__media").element as HTMLVideoElement;
    base.loop = true;
    await expect.poll(() => base.paused).toBe(false);
    const input = view.$('[aria-label="Reply"]').element;
    const frame = view.$('[data-happy-desktop-ui="story-viewer-frame"]').element;
    const before = frame.getBoundingClientRect().toJSON();
    await userEvent.click(view.$('[data-happy-desktop-ui="story-viewer-peek"]').element);
    expect(base.paused).toBe(true);
    expect(view.$('[aria-label="Reply"]').element).toBe(input);
    expect(frame.getBoundingClientRect().toJSON()).toEqual(before);
    const overlay = view.$('[aria-label="Replies"]').element;
    expect(getComputedStyle(view.$(".happy-story-viewer__shade").element).backgroundColor).toBe(
        "rgba(0, 0, 0, 0.65)",
    );
    expect(getComputedStyle(input).borderRadius).toBe("999px");
    expect(document.activeElement).toBe(overlay);
    expect(overlay.textContent).toContain("Hello");
    expect(overlay.textContent).not.toContain("Open chat");
    expect(chat).not.toHaveBeenCalled();
    overlay.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -100 }));
    await expect.poll(() => base.paused).toBe(false);
    view.destroy();
    const person = viewer([], { replies: [reply("a", "Hello")], replyCount: 1 });
    await person.ready();
    await userEvent.click(person.$('[data-happy-desktop-ui="story-viewer-peek"]').element);
    expect(document.body.textContent).not.toContain("Open chat");
    person.destroy();
});

it("pauses media and image progress during a hold, fades chrome, resumes on release or leave, and consumes the release click", async () => {
    for (const kind of ["image", "video"] as const) {
        const log: string[] = [];
        const view = viewer(log, {
            media: { kind, url: kind === "video" ? clip : PIXEL },
            mediaLayers: [ROUND],
            onRepost: async () => true,
        });
        await view.ready();
        const frame = view.$(".happy-story-viewer__frame").element;
        const media = view.$(".happy-story-viewer__media").element;
        const videos = [...frame.querySelectorAll("video")];
        const actions = view.$(".happy-story-viewer__actions").element;
        for (const button of actions.querySelectorAll("button")) {
            await userEvent.hover(button);
            const style = getComputedStyle(button);
            expect(style.color).toBe("rgb(255, 255, 255)");
            expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
            expect(style.backdropFilter).toBe("none");
            expect(button.getBoundingClientRect().width).toBe(32);
        }
        for (const video of videos) {
            video.loop = true;
            await expect.poll(() => video.paused).toBe(false);
        }
        const pointer = (type: string, options: PointerEventInit = {}) =>
            flushSync(() =>
                media.dispatchEvent(
                    new PointerEvent(type, { bubbles: true, button: 0, ...options }),
                ),
            );
        const progress = frame.querySelector<HTMLElement>(".happy-story-viewer__progress");
        await userEvent.hover(media);
        pointer("pointerdown");
        expect(frame.hasAttribute("data-held")).toBe(false);
        await expect.poll(() => frame.hasAttribute("data-held")).toBe(true);
        for (const video of videos) expect(video.paused).toBe(true);
        if (progress) expect(progress.style.animationPlayState).toBe("paused");
        await expect
            .poll(() => getComputedStyle(view.$(".happy-story-viewer__top").element).opacity)
            .toBe("0");
        expect(getComputedStyle(view.$(".happy-story-viewer__bottom").element).opacity).toBe("0");
        pointer("pointerup");
        for (const video of videos) await expect.poll(() => video.paused).toBe(false);
        if (progress) expect(progress.style.animationPlayState).toBe("running");
        const click = new MouseEvent("click", { bubbles: true, cancelable: true });
        media.dispatchEvent(click);
        expect(click.defaultPrevented).toBe(true);
        expect(log).toEqual([]);
        pointer("pointerdown");
        await expect.poll(() => frame.hasAttribute("data-held")).toBe(true);
        await userEvent.hover(view.$('[aria-label="Next story"]').element);
        expect(frame.hasAttribute("data-held")).toBe(false);
        for (const video of videos) await expect.poll(() => video.paused).toBe(false);
        await userEvent.click(view.$('[aria-label="Unmute"]').element);
        expect(view.$('[aria-label="Mute"]').element).toBeDefined();
        view.destroy();
    }
});

it("expands few or many replies above the fixed input, scrolls below the top controls, and collapses at the top", async () => {
    const heights: number[] = [];
    for (const count of [1, 80]) {
        const view = viewer([], {
            replies: Array.from({ length: count }, (_, index) =>
                reply(String(index), "Reply text"),
            ),
            replyCount: count,
        });
        await view.ready();
        const input = view.$('[aria-label="Reply"]').element;
        const before = input.getBoundingClientRect().toJSON();
        await userEvent.click(view.$('[data-happy-desktop-ui="story-viewer-peek"]').element);
        const list = view.$('[aria-label="Replies"]').element,
            frame = view.$('[data-happy-desktop-ui="story-viewer-frame"]').element;
        const box = list.getBoundingClientRect();
        expect(getComputedStyle(list).backgroundColor).toBe("rgba(0, 0, 0, 0)");
        expect(getComputedStyle(list).backdropFilter).toBe("none");
        expect(getComputedStyle(view.$(".happy-story-viewer__shade").element).backgroundColor).toBe(
            "rgba(0, 0, 0, 0.65)",
        );
        heights.push(box.height);
        expect(box.bottom).toBeCloseTo(input.getBoundingClientRect().top - 10);
        expect(box.top).toBeGreaterThan(
            view.$(".happy-story-viewer__top").element.getBoundingClientRect().bottom,
        );
        if (count > 1)
            expect(box.height).toBeGreaterThan(frame.getBoundingClientRect().height * 0.7);
        expect(list.scrollHeight > list.clientHeight).toBe(count > 1);
        if (count > 1) {
            list.scrollTop = 100;
            list.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -10 }));
            expect(list.getAttribute("aria-label")).toBe("Replies");
            list.scrollTop = 0;
        }
        list.dispatchEvent(
            new PointerEvent("pointerdown", { bubbles: true, clientY: 100, button: 0 }),
        );
        list.dispatchEvent(
            new PointerEvent("pointermove", { bubbles: true, clientY: 140, buttons: 1 }),
        );
        await expect.poll(() => list.getAttribute("aria-label")).toBeNull();
        expect(input.getBoundingClientRect().toJSON()).toEqual(before);
        view.destroy();
    }
    expect(heights[0]).toBeLessThan(heights[1]! / 2);
});

it("zooms around the cursor with its layers, prevents navigation, and leaves video playing", async () => {
    const log: string[] = [];
    const view = viewer(log, {
        media: { kind: "video", url: clip },
        text: { text: "A layer", x: 0.5, y: 0.5 },
    });
    await view.ready();
    const video = view.$(".happy-story-viewer__media").element as HTMLVideoElement;
    video.loop = true;
    await expect.poll(() => video.paused).toBe(false);
    const frame = view.$('[data-happy-desktop-ui="story-viewer-frame"]').element,
        zoom = view.$(".happy-story-viewer__zoom").element as HTMLElement;
    const box = frame.getBoundingClientRect();
    const wheel = () => {
        const event = new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
            deltaY: -400,
            clientX: box.x + box.width * 0.4,
            clientY: box.y + box.height * 0.3,
        });
        frame.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
    };
    flushSync(wheel);
    expect(zoom.style.transform).toBe("scale(3)");
    const viewport = view.$(".happy-story-viewer__viewport").element;
    expect(viewport.contains(zoom)).toBe(true);
    expect(getComputedStyle(viewport).overflow).toBe("hidden");
    expect(
        Number(getComputedStyle(view.$(".happy-story-viewer__top").element).zIndex),
    ).toBeGreaterThan(Number(getComputedStyle(viewport).zIndex));
    const origin = zoom.style.transformOrigin.split(" ").map(parseFloat);
    expect(origin[0]).toBeCloseTo(40, 0);
    expect(origin[1]).toBeCloseTo(30, 0);
    expect(zoom.contains(view.$('[data-happy-desktop-ui="story-text-layer"]').element)).toBe(true);
    view.$('[aria-label="Next story"]').element.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
    );
    view.$('[aria-label="Previous story"]').element.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
    );
    expect(log).toEqual([]);
    const started = video.currentTime;
    await expect.poll(() => video.currentTime).not.toBe(started);
    expect(video.paused).toBe(false);
    expect(view.$(".happy-story-viewer__media").element).toBe(video);
    await expect.poll(() => zoom.style.transform).toBe("scale(1)");
    flushSync(wheel);
    frame.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await expect.poll(() => zoom.style.transform).toBe("scale(1)");
    view.destroy();
});

it("advances images after five seconds of visible play, pauses replies and hidden windows, and keeps time while zoomed", async () => {
    const log: string[] = [];
    const view = viewer(log, { replies: [reply("a", "Hello")], replyCount: 1 });
    await view.ready();
    const progress = view.$(".happy-story-viewer__progress").element;
    const animation = progress.getAnimations()[0]!;
    expect(animation.effect!.getTiming().duration).toBe(5000);
    await expect.poll(() => Number(animation.currentTime)).toBeGreaterThan(0);
    const frame = view.$('[data-happy-desktop-ui="story-viewer-frame"]').element;
    frame.dispatchEvent(
        new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -200 }),
    );
    expect(getComputedStyle(progress).animationPlayState).toBe("running");
    await userEvent.click(view.$('[data-happy-desktop-ui="story-viewer-peek"]').element);
    await expect.poll(() => animation.playState).toBe("paused");
    await userEvent.click(view.$('[aria-label="Collapse replies"]').element);
    await expect.poll(() => animation.playState).toBe("running");
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    await expect.poll(() => animation.playState).toBe("paused");
    hidden.mockRestore();
    document.dispatchEvent(new Event("visibilitychange"));
    await expect.poll(() => animation.playState).toBe("running");
    animation.currentTime = 4990;
    await expect.poll(() => log).toContain("step 1");
    view.destroy();
});

it("guards an in-flight post, trims text, keeps caption separate, and resets the next composition", async () => {
    let finish!: (accepted: boolean) => void;
    const post = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const view = await repostOpen([], { onRepost: post });
    const controls = [...document.querySelector(".happy-story-viewer__record")!.children].map(
        (node) => node.getBoundingClientRect(),
    );
    const gaps = controls.slice(1).map((box, index) => box.left - controls[index]!.right);
    expect(gaps).toEqual([8, 8, 8]);
    expect(getComputedStyle(named("textarea", "Caption")).flexGrow).toBe("1");
    await userEvent.click(named("button", "Text"));
    await page.getByRole("textbox", { name: "Story text" }).fill("  Layer  ");
    await page.getByRole("textbox", { name: "Caption", exact: true }).fill("Caption");
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}second");
    expect((named("textarea", "Caption") as HTMLTextAreaElement).value).toBe("Caption\nsecond");
    await userEvent.keyboard("{Enter}");
    expect(post).toHaveBeenCalledOnce();
    const button = named("button", "Post") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    button.click();
    await userEvent.keyboard("{Enter}");
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0]).toEqual([
        {
            caption: "Caption\nsecond",
            text: { text: "Layer", x: 0.5, y: 0.5 },
            mediaLayers: [],
        },
    ]);
    finish(true);
    await expect.poll(() => document.querySelector('[aria-label="Caption"]')).toBeNull();
    await userEvent.click(named("button", "More"));
    await userEvent.click(named('[role="menuitem"]', "Repost"));
    expect(document.querySelector('[data-happy-desktop-ui="story-text-layer"]')).toBeNull();
    expect((named("textarea", "Caption") as HTMLTextAreaElement).value).toBe("");
    await userEvent.click(named("button", "Text"));
    await page.getByRole("textbox", { name: "Story text" }).fill("   ");
    await userEvent.click(named("button", "Post"));
    expect(post.mock.calls[1]).toEqual([{ mediaLayers: [] }]);
    finish(true);
    view.destroy();
});

it("layers Escape through editing, composition and replies, and cancels a pending camera", async () => {
    const cam = camera(true),
        log: string[] = [];
    const view = await repostOpen(log, { replies: [reply("a", "Hello")], replyCount: 1 });
    await userEvent.click(named("button", "Text"));
    await page.getByRole("textbox", { name: "Story text" }).fill("Keep this");
    await userEvent.keyboard("{Escape}");
    expect(document.querySelector('[aria-label="Story text"]')).toBeNull();
    expect(named("button", "Post")).toBeDefined();
    expect(log).toEqual([]);
    await userEvent.click(named("button", "Camera"));
    expect(named("button", "Camera").querySelector('[data-glyph="close"]')).not.toBeNull();
    await userEvent.click(named("button", "Camera"));
    cam.grant();
    await expect.poll(cam.live).toBe(false);
    await userEvent.keyboard("{Escape}");
    expect(log).toEqual([]);
    await userEvent.click(view.$('[data-happy-desktop-ui="story-viewer-peek"]').element);
    expect(document.activeElement).toBe(view.$('[aria-label="Replies"]').element);
    await userEvent.keyboard("{Escape}");
    expect(document.querySelector('[aria-label="Replies"]')).toBeNull();
    expect(log).toEqual(["replies"]);
    await userEvent.keyboard("{Escape}");
    expect(log).toEqual(["replies", "close"]);
    view.destroy();
});

it("offers mute controls for a round video over an image story", async () => {
    const view = viewer([], {
        repost: { from: { name: "Task A", face: { initials: "TA" } } },
        mediaLayers: [{ ...ROUND, url: "data:video/mp4;base64,AAAA" }],
    });
    await view.ready();
    const round = view.$('[data-happy-desktop-ui="story-viewer-round"]')
        .element as HTMLVideoElement;
    expect(round.muted).toBe(true);
    await userEvent.click(view.$('[aria-label="Unmute"]').element);
    expect(round.muted).toBe(false);
    await userEvent.click(view.$('[aria-label="Mute"]').element);
    expect(round.muted).toBe(true);
    view.destroy();
});

it("AC24 puts Your Story first and hands gallery images and MP4s to the shared composer", async () => {
    const create = vi.fn();
    const view = createRenderer();
    view.render(
        () => (
            <StoriesRow
                items={[]}
                onOpen={() => undefined}
                create={{ id: "me", face: { initials: "K" }, onPick: create }}
            />
        ),
        {
            width: 300,
            height: 100,
        },
    );
    await view.ready();
    const first = view.$(".happy-stories-row").element.firstElementChild!;
    expect(first.textContent).toContain("Your Story");
    const input = view.$('input[type="file"]').element as HTMLInputElement;
    expect(input.accept).toBe("image/*,video/mp4");
    for (const type of ["image/png", "video/mp4"]) {
        const files = new DataTransfer();
        const file = new File(["media"], "story", { type });
        files.items.add(file);
        input.files = files.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        expect(create).toHaveBeenLastCalledWith(file);
    }
    view.destroy();
    const post = vi.fn(async () => true);
    const composer = viewer([], { onPost: post });
    await composer.ready();
    expect(getComputedStyle(composer.$(".happy-story-viewer__top").element).display).toBe("none");
    expect(composer.$('[aria-label="Close"]').element.getBoundingClientRect().left).toBe(16);
    expect(named("button", "Text")).toBeDefined();
    expect(named("button", "Camera")).toBeDefined();
    await userEvent.click(named("button", "Post"));
    expect(post).toHaveBeenCalledWith({ mediaLayers: [] });
    composer.destroy();
});

it("uses your circular avatar with a separate add badge, then opens your live stories without moving the tile", async () => {
    const open = vi.fn(),
        pick = vi.fn();
    let phaseSet!: (phase: "unseen" | "seen" | null) => void;
    function Row() {
        const [phase, setPhase] = useState<"unseen" | "seen" | null>(null);
        phaseSet = setPhase;
        return (
            <StoriesRow
                items={
                    phase
                        ? [{ id: "me", name: "Kirill", face: { initials: "K" }, state: phase }]
                        : []
                }
                create={{ id: "me", face: { initials: "K", imageUrl: PIXEL }, onPick: pick }}
                onOpen={open}
            />
        );
    }
    const view = createRenderer();
    view.render(() => <Row />, { width: 300, height: 100 });
    await view.ready();
    const main = view.$(".happy-stories-row__self .happy-stories-row__photo").element;
    const avatar = main.querySelector<HTMLElement>(".happy-avatar")!,
        before = main.getBoundingClientRect().toJSON();
    expect(avatar.querySelector("img")!.src).toBe(PIXEL);
    expect(getComputedStyle(avatar).borderRadius).toBe("999px");
    expect(getComputedStyle(avatar).outlineStyle).toBe("none");
    const badge = view.$('[aria-label="Add a story"]').element;
    const avatarBox = avatar.getBoundingClientRect(),
        badgeBox = badge.getBoundingClientRect();
    expect(badgeBox.right).toBeGreaterThan(avatarBox.right);
    expect(badgeBox.bottom).toBeGreaterThan(avatarBox.bottom);
    expect(badgeBox.width).toBe(15);
    const picker = vi
        .spyOn(view.$('input[type="file"]').element as HTMLInputElement, "click")
        .mockImplementation(() => undefined);
    await userEvent.click(main);
    expect(picker).toHaveBeenCalledOnce();
    flushSync(() => phaseSet("unseen"));
    expect(view.$(".happy-stories-row__self .happy-stories-row__photo").element).toBe(main);
    expect(main.getBoundingClientRect().toJSON()).toEqual(before);
    expect(
        view.$(".happy-stories-row").element.querySelectorAll(".happy-stories-row__item"),
    ).toHaveLength(1);
    expect(
        main.closest(".happy-stories-row__item")!.querySelector(":scope > span")!.textContent,
    ).toBe("Your Story");
    expect(getComputedStyle(avatar).outlineStyle).toBe("solid");
    const unseen = getComputedStyle(avatar).outlineColor;
    await userEvent.click(main);
    expect(open).toHaveBeenCalledWith("me");
    await userEvent.click(badge);
    expect(open).toHaveBeenCalledOnce();
    expect(picker).toHaveBeenCalledTimes(2);
    flushSync(() => phaseSet("seen"));
    expect(getComputedStyle(avatar).outlineColor).not.toBe(unseen);
    expect(main.getBoundingClientRect().toJSON()).toEqual(before);
    picker.mockRestore();
    view.destroy();
});

it("lays agents out as rounded tiles and people as circles, ringed accent or grey", async () => {
    const log: string[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <StoriesRow
                items={[
                    {
                        id: "a",
                        name: "Task A",
                        face: { initials: "TA", type: "agent" },
                        state: "unseen",
                    },
                    { id: "p", name: "Kirill", face: { initials: "K" }, state: "seen" },
                ]}
                onOpen={(id) => log.push(id)}
            />
        ),
        { width: 300, height: 100 },
    );
    await view.ready();
    const [agent, person] = ui(view.container, "stories-row-item").map((item) =>
        getComputedStyle(item.querySelector(".happy-avatar")!),
    );
    // A 36px tile: the agent's corners are rounded, the person's meet in a circle.
    expect(parseFloat(agent!.borderTopLeftRadius)).toBeLessThan(18);
    expect(parseFloat(person!.borderTopLeftRadius)).toBeGreaterThanOrEqual(18);
    expect(agent!.outlineStyle).toBe("solid");
    expect(person!.outlineColor).not.toBe(agent!.outlineColor);
    await userEvent.click(ui(view.container, "stories-row-item")[1]!);
    expect(log).toEqual(["p"]);
    view.destroy();
});
