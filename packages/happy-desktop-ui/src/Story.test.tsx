import "./styles.css";
import { useState } from "react";
import { flushSync } from "react-dom";
import { afterEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { Sidebar, type SidebarItem } from "./Sidebar";
import { StoriesRow } from "./StoriesRow";
import { roundMimeType, StoryViewer, type StoryViewerProps } from "./StoryViewer";
import { createRenderer } from "./testing";

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

const reply = (id: string, text: string) => ({
    id,
    name: `Person ${id}`,
    face: { initials: id.toUpperCase() },
    text,
});

function viewer(log: string[], overrides: Partial<StoryViewerProps> = {}) {
    const props: StoryViewerProps = {
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
    // The media fills the frame.
    const media = dialog.querySelector<HTMLElement>(".happy-story-viewer__media")!;
    expect(getComputedStyle(media).objectFit).toBe("cover");
    expect(media.getBoundingClientRect().width).toBeCloseTo(width, 0);

    await userEvent.click(view.$('[aria-label="Next story"]').element);
    await userEvent.click(view.$('[aria-label="Previous story"]').element);
    await userEvent.click(view.$('[aria-label="Close"]').element);
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
    const close = view.$('[aria-label="Close"]').element as HTMLElement;
    close.focus();
    flushSync(rerender);
    expect(view.$('[data-happy-desktop-ui="story-viewer"]').element.textContent).toContain("one!");
    expect(document.activeElement).toBe(close);
    view.destroy();
});

it("steps on past a video that cannot play, and mutes and unmutes it", async () => {
    const log: string[] = [];
    const view = viewer(log, {
        media: { kind: "video", url: "data:video/mp4;base64,AAAA" },
        segment: { index: 0, total: 2 },
    });
    await view.ready();
    await expect.poll(() => log).toEqual(["step 1"]);
    const video = view.$(".happy-story-viewer__media").element as HTMLVideoElement;
    expect(video.muted).toBe(true);
    await userEvent.click(view.$('[aria-label="Unmute"]').element);
    expect(video.muted).toBe(false);
    view.destroy();
});

it("sends a reply, peeks at the last two without moving the frame, and drags the drawer shut", async () => {
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

    const peek = view.$('[data-happy-desktop-ui="story-viewer-peek"]').element;
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

    await userEvent.click(peek);
    expect(log.at(-1)).toBe("replies");
    const drawer = view.$('[data-happy-desktop-ui="story-viewer-drawer"]').element;
    const head = drawer.querySelector("header")!;
    const start = head.getBoundingClientRect();
    const at = { x: start.x + start.width / 2, y: start.y + 8 };
    const pointer = (type: string, y: number) =>
        head.dispatchEvent(
            new PointerEvent(type, { bubbles: true, clientX: at.x, clientY: y, pointerId: 1 }),
        );
    // A short drag springs back; a long one closes it.
    const drag = async (dy: number) => {
        for (const [type, y] of [
            ["pointerdown", 0],
            ["pointermove", dy],
            ["pointerup", dy],
        ] as const) {
            pointer(type, at.y + y);
            await new Promise(requestAnimationFrame);
        }
    };
    await drag(30);
    await expect
        .poll(() => document.querySelector('[data-happy-desktop-ui="story-viewer-drawer"]'))
        .not.toBeNull();
    await drag(120);
    await expect
        .poll(() => document.querySelector('[data-happy-desktop-ui="story-viewer-drawer"]'))
        .toBeNull();
    view.destroy();
});

it("offers repost and delete from ⋯, and shows a repost's chip", async () => {
    const log: string[] = [];
    const view = viewer(log, {
        onDelete: () => log.push("delete"),
        onRepost: async (caption, round) => {
            log.push(`repost ${caption} ${String(round)}`);
            return true;
        },
        repost: { from: "Release bot", roundUrl: null },
    });
    await view.ready();
    expect(document.body.textContent).toContain("Reposted from Release bot");
    await userEvent.click(view.$('[aria-label="More"]').element);
    await userEvent.click(named('[role="menuitem"]', "Repost"));
    await userEvent.type(view.$('[aria-label="Repost caption"]').element, "Look");
    await userEvent.click(named("button", "Repost"));
    expect(log).toEqual(["repost Look null"]);
    await userEvent.click(view.$('[aria-label="More"]').element);
    await userEvent.click(named('[role="menuitem"]', "Delete"));
    await userEvent.click(named("button", "Delete"));
    expect(log.at(-1)).toBe("delete");
    view.destroy();
});

/** A camera whose tracks say when they stop, and a recorder that takes only what `mp4` allows. */
function camera(mp4: boolean) {
    const canvas = document.createElement("canvas");
    const stream = canvas.captureStream();
    const recorders: { state: string }[] = [];
    let grant: () => void = () => undefined;
    const granted = new Promise<void>((resolve) => (grant = resolve));
    const getUserMedia = vi.fn(async () => {
        await granted;
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
    const live = () => stream.getTracks().some((track) => track.readyState === "live");
    return { getUserMedia, grant, live, recorders };
}

afterEach(() => vi.unstubAllGlobals());

const named = (role: string, text: string) =>
    [...document.querySelectorAll<HTMLElement>(role)]
        .reverse()
        .find((each) => each.textContent?.includes(text))!;

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
    await userEvent.click(named("button", "Record"));
    await expect.poll(() => cam.recorders[0]?.state).toBe("recording");
    expect(cam.live()).toBe(true);
    view.destroy();
    expect(cam.live()).toBe(false);
    expect(cam.recorders[0]!.state).toBe("inactive");

    // The camera answers only after the reader chose Delete instead: nothing records.
    const late = camera(true);
    const again = await repostOpen([]);
    await userEvent.click(named("button", "Record"));
    await userEvent.click(again.$('[aria-label="More"]').element);
    await userEvent.click(named('[role="menuitem"]', "Delete"));
    late.grant();
    await expect.poll(() => late.live()).toBe(false);
    expect(late.recorders).toHaveLength(0);
    again.destroy();
});

it("offers no recording without H.264 MP4, and keeps a refused repost to try again", async () => {
    const cam = camera(false);
    const log: string[] = [];
    const view = await repostOpen(log, {
        onRepost: async (caption) => {
            log.push(`repost ${caption}`);
            return false;
        },
    });
    await userEvent.click(named("button", "Record"));
    expect(document.body.textContent).toContain("No camera is available.");
    expect(cam.getUserMedia).not.toHaveBeenCalled();
    const caption = view.$('[aria-label="Repost caption"]').element as HTMLInputElement;
    await userEvent.type(caption, "Look");
    await userEvent.click(named("button", "Repost"));
    expect(log).toEqual(["repost Look"]);
    expect(caption.value).toBe("Look");
    view.destroy();
});

it("records the round as MP4 when the recorder can", () => {
    expect(roundMimeType((type) => type.startsWith("video/mp4"))).toBe(
        "video/mp4;codecs=avc1,mp4a.40.2",
    );
    expect(roundMimeType(() => false)).toBeUndefined();
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
