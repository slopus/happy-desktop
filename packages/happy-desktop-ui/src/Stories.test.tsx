import "./styles.css";
import { expect, it } from "vitest";
import { RichTaskList } from "./RichTaskList";
import { StoriesRow } from "./StoriesRow";
import { StoryViewer, type StoryViewerProps } from "./StoryViewer";
import { ThemeScope } from "./ThemeScope";
import { createRenderer } from "./testing";

/*
 * A ring has one segment per live story, the seen ones grey and thinner; the
 * reply bar under a story is opaque and its text reads at 4.5:1 or better,
 * whatever the frame above it is and in either appearance.
 */

const frame = (fill: string) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240"><rect width="360" height="240" fill="${fill}"/></svg>`)}`;

const VIEWER: StoryViewerProps = {
    segments: { total: 2, current: 0 },
    poster: { name: "Onboarding redesign", mark: { kind: "icon", slug: "ux", label: "UX" } },
    time: "2h",
    frame: { kind: "image", url: frame("#ffffff") },
    caption: "Onboarding for the Projects sidebar",
    replies: { status: "ready", items: [] },
    replyTarget: "Onboarding redesign",
    reply: { phase: "idle" },
    action: { phase: "idle" },
    onReplySend: () => undefined,
    onStep: () => undefined,
    onClose: () => undefined,
};

/** sRGB channels and alpha of a computed colour, as every engine serializes one. */
function rgba(value: string): [number, number, number, number] {
    const srgb = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/u.exec(value);
    if (srgb) return [+srgb[1]! * 255, +srgb[2]! * 255, +srgb[3]! * 255, +(srgb[4] ?? 1)];
    const rgb = /rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:,? \/? ?([\d.]+))?\)/u.exec(value);
    if (!rgb) throw new Error(`Unreadable colour ${value}`);
    return [+rgb[1]!, +rgb[2]!, +rgb[3]!, +(rgb[4] ?? 1)];
}

function contrast(foreground: string, background: string): number {
    const luminance = (color: [number, number, number, number]) => {
        const [r, g, b] = color.slice(0, 3).map((channel) => {
            const c = channel / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const [light, dark] = [luminance(rgba(foreground)), luminance(rgba(background))].sort(
        (a, b) => b - a,
    );
    return (light! + 0.05) / (dark! + 0.05);
}

it("draws one segment per live story and greys the seen ones, in the row and on the card", async () => {
    const view = createRenderer({ width: 304, height: 200 });
    view.render(() => (
        <div>
            <StoriesRow
                items={[
                    {
                        id: "me",
                        name: "Me",
                        self: true,
                        mark: { kind: "person", label: "Me" },
                        segments: { total: 0, unseen: 0 },
                    },
                    {
                        id: "health",
                        name: "System Health",
                        mark: { kind: "icon", slug: "monitoring", label: "Health" },
                        segments: { total: 3, unseen: 1 },
                    },
                    {
                        id: "maya",
                        name: "Maya",
                        mark: { kind: "person", label: "Maya" },
                        segments: { total: 1, unseen: 0 },
                    },
                ]}
                onOpen={() => undefined}
            />
            <RichTaskList
                onMoreToggle={() => undefined}
                onSectionCollapseToggle={() => undefined}
                onSelect={() => undefined}
                onStoryOpen={() => undefined}
                rows={[
                    {
                        kind: "task",
                        card: {
                            id: "onboarding",
                            title: "Onboarding redesign",
                            time: "4m",
                            status: "Shipped the preview",
                            iconSlug: "ux",
                            story: { total: 2, unseen: 0 },
                            faces: [],
                            signal: null,
                            subRows: [],
                            more: 0,
                            expanded: false,
                        },
                    },
                ]}
                selectedId={null}
            />
        </div>
    ));
    await view.ready();
    const root = view.container;
    const rings = [
        ...root.querySelectorAll('[data-happy-desktop-ui="stories-row-item"]'),
        root.querySelector('[data-happy-desktop-ui="rich-task-disc"]')!,
    ].map((element) => {
        const segments = [...element.querySelectorAll(".happy-story-ring__segment")];
        const seen = segments.filter((segment) => segment.hasAttribute("data-seen"));
        return { segments, seen, unseen: segments.filter((segment) => !seen.includes(segment)) };
    });
    expect(rings.map((ring) => [ring.segments.length, ring.seen.length])).toEqual([
        [0, 0],
        [3, 2],
        [1, 1],
        [2, 2],
    ]);

    const style = (segment: Element) => getComputedStyle(segment);
    const accent = style(rings[1]!.unseen[0]!);
    expect(rgba(accent.stroke).slice(0, 3)).toEqual([43, 172, 204]);
    expect(accent.strokeWidth).toBe("2px");
    for (const seen of [...rings[1]!.seen, ...rings[3]!.seen]) {
        expect(style(seen).strokeWidth).toBe("1.5px");
        expect(rgba(style(seen).stroke)[3]).toBeLessThan(0.3);
    }
    // The segments of a ring share its circle and leave gaps between them.
    const dashes = rings[1]!.segments.map((segment) => segment.getAttribute("stroke-dashoffset"));
    expect(new Set(dashes).size).toBe(3);
});

it("keeps the reply bar opaque and readable over a white frame and a dark one", async () => {
    const view = createRenderer({ width: 400, height: 1300 });
    const cases = [
        ["light", "#ffffff"],
        ["light", "#111111"],
        ["dark", "#ffffff"],
        ["dark", "#111111"],
    ] as const;
    view.render(() => (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cases.map(([mode, fill]) => (
                <ThemeScope key={`${mode}${fill}`} mode={mode}>
                    <StoryViewer {...VIEWER} frame={{ kind: "image", url: frame(fill) }} />
                </ThemeScope>
            ))}
        </div>
    ));
    await view.ready();
    const viewers = [...view.container.querySelectorAll('[data-happy-desktop-ui="story-viewer"]')];
    expect(viewers).toHaveLength(4);
    for (const viewer of viewers) {
        const input = viewer.querySelector('[data-happy-desktop-ui="story-viewer-input"]')!;
        const shown = viewer.querySelector('[data-happy-desktop-ui="story-viewer-frame"]')!;
        const box = getComputedStyle(input);
        // Solid, with a hairline, and never laid over the frame.
        expect(rgba(box.backgroundColor)[3]).toBe(1);
        expect(box.borderTopStyle).toBe("solid");
        expect(input.getBoundingClientRect().top).toBeGreaterThanOrEqual(
            shown.getBoundingClientRect().bottom,
        );
        expect(contrast(box.color, box.backgroundColor)).toBeGreaterThanOrEqual(4.5);
        const placeholder = getComputedStyle(input, "::placeholder").color;
        expect(contrast(placeholder, box.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    }
    // The appearance decides the bar, not the frame.
    const colors = viewers.map(
        (viewer) =>
            getComputedStyle(viewer.querySelector('[data-happy-desktop-ui="story-viewer-input"]')!)
                .backgroundColor,
    );
    expect(colors[0]).toBe(colors[1]);
    expect(colors[2]).toBe(colors[3]);
    expect(colors[0]).not.toBe(colors[2]);
});
