import "./styles.css";
import {
    connectHappyAgent,
    happyAgentRichTasksStoreCreate,
    happyAgentStoriesStoreCreate,
} from "happy-desktop-state";
import { fakeHappyAgentDaemonCreate, fakeStory } from "happy-desktop-state/testing";
import { expect, it, vi } from "vitest";
import { StoriesRow } from "./StoriesRow";
import { StoryViewer, type StoryViewerProps } from "./StoryViewer";
import { ThemeScope } from "./ThemeScope";
import { createRenderer } from "./testing";

/* Ring segments, the reply bar's contrast over any frame, and a round video's repost. */

const noop = () => undefined;
const frame = (fill: string) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240"><rect width="360" height="240" fill="${fill}"/></svg>`)}`;
const VIEWER: StoryViewerProps = {
    segment: { index: 0, total: 2 },
    poster: { name: "Onboarding redesign", mark: { kind: "icon", slug: "ux", label: "UX" } },
    time: "2h",
    frame: { kind: "image", url: frame("#ffffff") },
    caption: "Onboarding for the Projects sidebar",
    replies: { status: "ready", items: [] },
    replyTarget: "Onboarding redesign",
    reply: { phase: "idle" },
    action: { phase: "idle" },
    onReplySend: noop,
    onStep: noop,
    onClose: noop,
};

/** sRGB channels (0–255) and alpha of a computed colour, as every engine serializes one. */
function rgba(value: string): number[] {
    const srgb = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/u.exec(value);
    const rgb = srgb ?? /rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:,? \/? ?([\d.]+))?\)/u.exec(value);
    if (!rgb) throw new Error(`Unreadable colour ${value}`);
    const scale = srgb ? 255 : 1;
    return [+rgb[1]! * scale, +rgb[2]! * scale, +rgb[3]! * scale, +(rgb[4] ?? 1)];
}

const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function contrast(foreground: string, background: string): number {
    const luminance = (value: string) => {
        const [r, g, b] = rgba(value).map((channel) => linear(channel / 255));
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (light! + 0.05) / (dark! + 0.05);
}

it("draws one segment per live story and greys the seen ones", async () => {
    const mark = { kind: "person", label: "P" } as const;
    const item = (total: number, unseen: number, self = false) => ({
        id: `${String(total)}${String(unseen)}`,
        name: "P",
        mark,
        segments: { total, unseen },
        self,
    });
    const view = createRenderer({ width: 304, height: 120 });
    view.render(() => (
        <StoriesRow items={[item(0, 0, true), item(3, 1), item(1, 0)]} onOpen={noop} />
    ));
    await view.ready();
    const rings = [
        ...view.container.querySelectorAll('[data-happy-desktop-ui="stories-row-item"]'),
    ].map((element) => [...element.querySelectorAll(".happy-story-ring__segment")]);
    const seen = (segment: Element) => segment.hasAttribute("data-seen");
    expect(
        rings.map((ring) => `${String(ring.length)}/${String(ring.filter(seen).length)}`),
    ).toEqual(["0/0", "3/2", "1/1"]);
    const accent = getComputedStyle(rings[1]!.find((segment) => !seen(segment))!);
    expect([rgba(accent.stroke).slice(0, 3), accent.strokeWidth]).toEqual([[43, 172, 204], "2px"]);
    for (const grey of rings.flat().filter(seen)) {
        expect(getComputedStyle(grey).strokeWidth).toBe("1.5px");
        expect(rgba(getComputedStyle(grey).stroke)[3]).toBeLessThan(0.3);
    }
    // One circle, with gaps between the segments.
    const offsets = rings[1]!.map((segment) => segment.getAttribute("stroke-dashoffset"));
    expect(new Set(offsets).size).toBe(3);
});

it("keeps the reply bar opaque and readable over a white frame and a dark one", async () => {
    const cases = (["light", "dark"] as const).flatMap((mode) =>
        ["#ffffff", "#111111"].map((fill) => ({ mode, fill })),
    );
    const view = createRenderer({ width: 400, height: 1300 });
    view.render(() => (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cases.map(({ mode, fill }) => (
                <ThemeScope key={`${mode}${fill}`} mode={mode}>
                    <StoryViewer {...VIEWER} frame={{ kind: "image", url: frame(fill) }} />
                </ThemeScope>
            ))}
        </div>
    ));
    await view.ready();
    const viewers = [...view.container.querySelectorAll('[data-happy-desktop-ui="story-viewer"]')];
    const colors = viewers.map((viewer) => {
        const input = viewer.querySelector('[data-happy-desktop-ui="story-viewer-input"]')!;
        const shown = viewer.querySelector('[data-happy-desktop-ui="story-viewer-frame"]')!;
        const box = getComputedStyle(input);
        // Solid, with a hairline, never laid over the frame, and readable.
        expect(rgba(box.backgroundColor)[3]).toBe(1);
        expect(box.borderTopStyle).toBe("solid");
        expect(input.getBoundingClientRect().top).toBeGreaterThanOrEqual(
            shown.getBoundingClientRect().bottom,
        );
        for (const text of [box.color, getComputedStyle(input, "::placeholder").color])
            expect(contrast(text, box.backgroundColor)).toBeGreaterThanOrEqual(4.5);
        return box.backgroundColor;
    });
    // The appearance decides the bar, not the frame.
    expect([new Set(colors).size, colors[0], colors[2]]).toEqual([2, colors[1], colors[3]]);
});

it("records a round video from the camera, uploads it, and reposts the story with it", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.taskSectionsSet([]);
    daemon.storiesSet([fakeStory("story_1", "agent_a")]);
    await daemon.client.saveUserSetting("tasks.rich", { value: true });
    const { client } = daemon;
    const connection = connectHappyAgent({ endpoint: "http://agent.test/", token: "t", client });
    const richTasks = happyAgentRichTasksStoreCreate({ client, connection });
    const store = happyAgentStoriesStoreCreate({ client, connection, richTasks });
    store.subscribe(noop);
    await vi.waitFor(() => expect(store.get()).toMatchObject({ mode: "on", rings: [{}] }));
    store.ringOpen("agent:agent_a");
    // A fake camera: a canvas that keeps drawing, captured as a MediaStream.
    const canvas = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
    const context = canvas.getContext("2d")!;
    const paint = setInterval(() => context.fillRect(0, 0, Date.now() % 64, 64), 20);
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(canvas.captureStream(30));

    const view = createRenderer({ width: 400, height: 700 });
    view.render(() => <StoryViewer {...VIEWER} onRepost={store.storyRepost} />);
    await view.ready();
    const root = view.container;
    const record = '[data-happy-desktop-ui="story-viewer-record"] button';
    const round = '[data-happy-desktop-ui="story-viewer-round"]';
    const press = (selector: string) => root.querySelector<HTMLButtonElement>(selector)!.click();
    press('[aria-label="Repost"]');
    await vi.waitFor(() => expect(root.querySelector(record)?.textContent).toBe("Record"));
    press(record);
    await vi.waitFor(() => expect(root.querySelector(`${round}[data-live]`)).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 400));
    press(record);
    await vi.waitFor(() => expect(root.querySelector(`${round}:not([data-live])`)).not.toBeNull());
    press(`${record}:nth-of-type(2)`);
    await vi.waitFor(() => expect(daemon.callCount("repostStory")).toBe(1));
    clearInterval(paint);
    vi.restoreAllMocks();
    store[Symbol.dispose]();
    connection.close();

    // The repost carries the upload's ID, so the upload came first.
    const [upload, repost] = ["uploadArtifactFile", "repostStory"].map(
        (method) => daemon.calls.find((call) => call.method === method)!,
    );
    expect((upload!.args[0] as { data: ArrayBuffer }).data.byteLength).toBeGreaterThan(0);
    const path = expect.stringMatching(/^round\.(webm|mp4)$/u);
    expect(repost!.args).toMatchObject(["story_1", { round: { uploadId: "upload-1", path } }]);
});
