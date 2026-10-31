import "./styles.css";
import { expect, it } from "vitest";
import { RichTaskList, type RichTaskListRow } from "./RichTaskList";
import { createRenderer } from "./testing";

/** An icon picture's URL, as the daemon serves one. */
async function iconSrc(): Promise<string> {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#e8590c";
    context.fillRect(16, 16, 96, 96);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((png) => resolve(png!)));
    return URL.createObjectURL(blob);
}

const card = (id: string, src?: string): RichTaskListRow => ({
    kind: "task",
    card: {
        id,
        title: id,
        time: "4m",
        status: null,
        iconSrc: src,
        faces: [],
        signal: null,
        subRows: [],
        more: 0,
        expanded: false,
    },
});

it("draws a loaded icon where the letter tile stands, with no disc, and the tile for a broken one", async () => {
    const src = await iconSrc();
    const view = createRenderer({ width: 304, height: 240 });
    view.render(() => (
        <RichTaskList
            onMoreToggle={() => {}}
            onSectionCollapseToggle={() => {}}
            onSelect={() => {}}
            rows={[
                card("Kubernetes deployments", src),
                card("Waiting"),
                card("Broken", "data:image/png;base64,AAAA"),
            ]}
            selectedId={null}
        />
    ));
    await view.ready();
    const [loaded, waiting, broken] = [
        ...view.container.querySelectorAll('[data-happy-desktop-ui="rich-task-card"]'),
    ];
    const image = loaded!.querySelector<HTMLImageElement>("img.happy-task-icon")!;
    await image.decode();
    expect(image.naturalWidth).toBe(128);
    expect(waiting!.querySelector("img")).toBeNull();
    const tile = waiting!.querySelector(".happy-task-icon-fallback")!;
    expect(tile.textContent).toBe("W");
    // Same 40px box in the same place on both cards, and no ground under it.
    const box = (element: Element, row: Element) => {
        const rect = element.getBoundingClientRect();
        const origin = row.getBoundingClientRect();
        return [rect.left - origin.left, rect.top - origin.top, rect.width, rect.height];
    };
    expect(box(image, loaded!)).toEqual(box(tile, waiting!));
    expect(box(image, loaded!).slice(2)).toEqual([40, 40]);
    for (const row of [loaded!, waiting!]) {
        const disc = row.querySelector('[data-happy-desktop-ui="rich-task-disc"]')!;
        expect(getComputedStyle(disc).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    }
    // A picture that cannot be loaded falls back to the letter tile.
    await expect
        .poll(() => broken!.querySelector(".happy-task-icon-fallback")?.textContent)
        .toBe("B");
    view.destroy();
    URL.revokeObjectURL(src);
});
