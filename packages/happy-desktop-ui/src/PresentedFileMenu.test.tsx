import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";
import type { ConversationMediaItem, ConversationToolCall } from "happy-desktop-state";
import { afterEach, expect, it, vi } from "vitest";
import "./styles.css";
import { AgentActivityRow } from "./AgentActivityRow";
import { ConversationMedia } from "./ConversationMedia";
import { FileRevealContext, type FileReveal } from "./LinkContextMenu";
import { FileOpenContext, type FileOpen, type FileOpenApplication } from "./PresentedFileMenu";

/* A file a chat was shown opens in any application this machine offers for
 * it, as Finder's Open With does: a labelled block between the caller's own
 * rows and Show in Finder, the application a double-click uses first. */

const IMAGE_URL = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>')}`;
const SHEET_PATH = "/Users/happy/app/out/sales-report.xlsx";
const CHART_PATH = "/Users/happy/app/out/chart.png";

const sheet: ConversationMediaItem = {
    kind: "file",
    name: "sales-report.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 661_401,
    url: "https://happy.test/media/sheet",
    source: { path: "out/sales-report.xlsx", absolutePath: SHEET_PATH },
};
const picture: ConversationMediaItem = {
    kind: "image",
    name: "chart.png",
    mimeType: "image/png",
    size: 1,
    width: 800,
    height: 400,
    url: IMAGE_URL,
    source: { path: "out/chart.png", absolutePath: CHART_PATH },
};

const APPLICATIONS: readonly FileOpenApplication[] = [
    { id: "com.microsoft.Excel", name: "Microsoft Excel", isDefault: true },
    { id: "com.apple.Numbers", name: "Numbers", isDefault: false },
];

const roots: (() => void)[] = [];
afterEach(() => {
    for (const unmount of roots.splice(0)) unmount();
});

function mount(element: ReactElement): HTMLElement {
    const host = document.createElement("div");
    host.style.cssText = "width:640px;";
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() => root.render(element));
    roots.push(() => {
        root.unmount();
        host.remove();
    });
    return host;
}

function hosts(applications: () => Promise<readonly FileOpenApplication[]>) {
    const reveal = {
        path: vi.fn<FileReveal["path"]>(),
        link: vi.fn<FileReveal["link"]>(),
    } satisfies FileReveal;
    const opener = {
        applicationsRead: vi.fn<FileOpen["applicationsRead"]>(applications),
        open: vi.fn<FileOpen["open"]>(),
    } satisfies FileOpen;
    const wrap = (element: ReactElement) => (
        <FileRevealContext.Provider value={reveal}>
            <FileOpenContext.Provider value={opener}>{element}</FileOpenContext.Provider>
        </FileRevealContext.Provider>
    );
    return { reveal, opener, wrap };
}

function rightClick(element: Element): boolean {
    const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 40,
    });
    flushSync(() => element.dispatchEvent(event));
    return event.defaultPrevented;
}

const MENU = '[data-happy-desktop-ui="context-menu"]';

/** The menu's rows top to bottom: a label as `[label]`, a separator as `---`. */
function menuRows(): string[] {
    const menu = document.querySelector(MENU);
    if (!menu) return [];
    return [
        ...menu.querySelectorAll(
            '[data-happy-desktop-ui="menu-item"], [data-happy-desktop-ui="menu-label"], [data-happy-desktop-ui="menu-separator"]',
        ),
    ].map((row) => {
        const kind = row.getAttribute("data-happy-desktop-ui");
        if (kind === "menu-separator") return "---";
        if (kind === "menu-label") return `[${row.textContent ?? ""}]`;
        const label = row.querySelector('[data-happy-desktop-ui="menu-item-label"]')?.textContent;
        const detail = row.querySelector('[data-happy-desktop-ui="menu-item-detail"]')?.textContent;
        return detail ? `${label ?? ""} (${detail})` : (label ?? "");
    });
}

async function menuShown(): Promise<string[]> {
    await vi.waitFor(() => expect(document.querySelector(MENU)).not.toBeNull());
    return menuRows();
}

function choose(label: string) {
    const row = [...document.querySelectorAll(`${MENU} [data-happy-desktop-ui="menu-item-label"]`)]
        .find((element) => element.textContent === label)
        ?.closest<HTMLElement>('[role^="menuitem"]');
    expect(row, label).toBeDefined();
    flushSync(() => row!.click());
}

it("offers the applications a card's file opens in, the default first, between Open and Finder", async () => {
    const { opener, wrap } = hosts(() => Promise.resolve(APPLICATIONS));
    const open = vi.fn();
    const host = mount(wrap(<ConversationMedia items={[sheet]} onItemOpen={open} />));
    const card = host.querySelector('[data-happy-desktop-ui="result-card"]')!;
    const height = card.getBoundingClientRect().height;

    expect(rightClick(card)).toBe(true);
    expect(await menuShown()).toEqual([
        "Open",
        "---",
        "[Open with]",
        "Microsoft Excel (default)",
        "Numbers",
        "---",
        "Show in Finder",
        "Copy path",
    ]);
    expect(opener.applicationsRead).toHaveBeenCalledWith(SHEET_PATH);
    expect(card.getBoundingClientRect().height).toBe(height);
    choose("Numbers");
    expect(opener.open).toHaveBeenCalledWith(SHEET_PATH, "com.apple.Numbers");
    expect(menuRows()).toEqual([]);

    rightClick(card);
    await menuShown();
    choose("Microsoft Excel");
    expect(opener.open).toHaveBeenLastCalledWith(SHEET_PATH, "com.microsoft.Excel");
    expect(open).not.toHaveBeenCalled();
});

it("offers the block on a picture, and asks for it as the pointer arrives", async () => {
    const { opener, wrap } = hosts(() => Promise.resolve(APPLICATIONS.slice(1)));
    const host = mount(wrap(<ConversationMedia items={[picture]} onItemOpen={() => undefined} />));
    const media = host.querySelector('[data-happy-desktop-ui="conversation-media"]')!;
    // React draws enter from the pointer moving over the element from outside it.
    flushSync(() =>
        media.dispatchEvent(
            new PointerEvent("pointerover", { bubbles: true, relatedTarget: null }),
        ),
    );
    expect(opener.applicationsRead).toHaveBeenCalledWith(CHART_PATH);

    rightClick(host.querySelector('[data-happy-desktop-ui="media-image-tile"]')!);
    expect(await menuShown()).toEqual([
        "Open",
        "---",
        "[Open with]",
        "Numbers",
        "---",
        "Show in Finder",
        "Copy path",
    ]);
    choose("Numbers");
    expect(opener.open).toHaveBeenCalledWith(CHART_PATH, "com.apple.Numbers");
});

it("has no block for a file the host opens in nothing, or one it has no source for", async () => {
    const { opener, wrap } = hosts(() => Promise.resolve([]));
    const host = mount(wrap(<ConversationMedia items={[sheet]} onItemOpen={() => undefined} />));
    rightClick(host.querySelector('[data-happy-desktop-ui="result-card"]')!);
    expect(await menuShown()).toEqual(["Open", "---", "Show in Finder", "Copy path"]);
    choose("Open");

    const { source: _source, ...unsourced } = sheet;
    opener.applicationsRead.mockClear();
    const bare = mount(
        wrap(<ConversationMedia items={[unsourced]} onItemOpen={() => undefined} />),
    );
    rightClick(bare.querySelector('[data-happy-desktop-ui="result-card"]')!);
    expect(await menuShown()).toEqual(["Open"]);
    expect(opener.applicationsRead).not.toHaveBeenCalled();
});

it("opens without the block when the host is slow, and never changes its rows while up", async () => {
    let answer: (applications: readonly FileOpenApplication[]) => void = () => undefined;
    const { wrap } = hosts(
        () =>
            new Promise((resolve) => {
                answer = resolve;
            }),
    );
    const host = mount(wrap(<ConversationMedia items={[sheet]} onItemOpen={() => undefined} />));
    const asked = performance.now();
    rightClick(host.querySelector('[data-happy-desktop-ui="result-card"]')!);
    expect(await menuShown()).toEqual(["Open", "---", "Show in Finder", "Copy path"]);
    expect(performance.now() - asked).toBeLessThan(1_000);
    answer(APPLICATIONS);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(menuRows()).toEqual(["Open", "---", "Show in Finder", "Copy path"]);
});

const presented = (items: readonly ConversationMediaItem[]): ConversationToolCall => ({
    toolCallId: "present",
    toolName: "present_files",
    arguments: { filepaths: items.map((item) => item.source?.path ?? item.name) },
    status: "success",
    failed: false,
    display: `File ${items[0]!.name}`,
    presentation: { type: "media", items },
});

it("offers the same block on the line naming the one file a call showed", async () => {
    const { opener, wrap } = hosts(() => Promise.resolve(APPLICATIONS));
    const host = mount(
        wrap(<AgentActivityRow activity={{ kind: "tool", tool: presented([sheet]) }} />),
    );
    const line = host.querySelector('[data-happy-desktop-ui="agent-activity-line"]')!;
    expect(rightClick(line)).toBe(true);
    expect(await menuShown()).toEqual([
        "[Open with]",
        "Microsoft Excel (default)",
        "Numbers",
        "---",
        "Show in Finder",
        "Copy path",
    ]);
    choose("Microsoft Excel");
    expect(opener.open).toHaveBeenCalledWith(SHEET_PATH, "com.microsoft.Excel");
});
