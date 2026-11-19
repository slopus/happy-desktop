import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Display } from "electron";
import { afterEach, expect, it } from "vitest";
import { DesktopWindowStateStore } from "./windowState";

const roots: string[] = [];
afterEach(async () => {
    for (const root of roots.splice(0)) await rm(root, { force: true, recursive: true });
});

const display = { workArea: { height: 1040, width: 1920, x: 0, y: 0 } } as Display;
const bounds = { height: 800, width: 1200, x: 100, y: 80 };

async function statePath(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "happy-window-state-"));
    roots.push(root);
    return join(root, "window-state.json");
}

it("reopens maximized over the normal bounds it remembered", async () => {
    const path = await statePath();
    const store = await DesktopWindowStateStore.create(path);
    store.remember({ bounds, maximized: true });
    await store.flush();

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
        bounds,
        maximized: true,
        version: 2,
    });
    const reopened = await DesktopWindowStateStore.create(path);
    expect(reopened.restore([display], display)).toEqual({ bounds, maximized: true });
});

it("keeps the bounds of a version 1 file, not maximized", async () => {
    const path = await statePath();
    await writeFile(path, JSON.stringify({ bounds, version: 1 }));

    const store = await DesktopWindowStateStore.create(path);
    expect(store.restore([display], display)).toEqual({ bounds, maximized: false });
});

it("ignores a file it cannot trust", async () => {
    const path = await statePath();
    await writeFile(path, JSON.stringify({ bounds, maximized: "yes", version: 2 }));

    const store = await DesktopWindowStateStore.create(path);
    expect(store.restore([display], display)).toBeUndefined();
});

it("recenters an off-screen window on the primary display and keeps it maximized", async () => {
    const path = await statePath();
    const store = await DesktopWindowStateStore.create(path);
    store.remember({ bounds: { ...bounds, x: -32000, y: -32000 }, maximized: true });

    expect(store.restore([display], display)).toEqual({
        bounds: { height: 800, width: 1200, x: 360, y: 120 },
        maximized: true,
    });
    await store.flush();
});
