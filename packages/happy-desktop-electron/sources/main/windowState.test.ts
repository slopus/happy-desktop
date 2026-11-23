import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Display } from "electron";
import { describe, expect, it } from "vitest";
import { DesktopWindowStateStore } from "./windowState";

function display(x: number, y: number, width: number, height: number): Display {
    return { workArea: { x, y, width, height } } as Display;
}

async function storeWith(bounds: { x: number; y: number; width: number; height: number }) {
    const path = join(await mkdtemp(join(tmpdir(), "window-state-")), "window-state.json");
    await writeFile(path, JSON.stringify({ bounds, version: 1 }));
    return DesktopWindowStateStore.create(path);
}

describe("window state restore", () => {
    it("pulls a window whose title bar is above the screen back inside the work area", async () => {
        const primary = display(0, 0, 1920, 1032);
        const store = await storeWith({ x: 160, y: -18, width: 1100, height: 760 });
        expect(store.restore([primary], primary)).toEqual({ x: 160, y: 0, width: 1100, height: 760 });
    });

    it("keeps a window that is already fully inside unchanged", async () => {
        const primary = display(0, 0, 1920, 1032);
        const store = await storeWith({ x: 100, y: 50, width: 1100, height: 760 });
        expect(store.restore([primary], primary)).toEqual({ x: 100, y: 50, width: 1100, height: 760 });
    });

    it("fits to the display the window overlaps most and shrinks it when too large", async () => {
        const primary = display(0, 0, 1920, 1032);
        const second = display(1920, 0, 1280, 984);
        const store = await storeWith({ x: 2900, y: 500, width: 1400, height: 1200 });
        expect(store.restore([primary, second], primary)).toEqual({
            x: 1920,
            y: 0,
            width: 1280,
            height: 984,
        });
    });
});
